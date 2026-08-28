from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity

from app.extensions import db
from app.models.apartment import Apartment, Meter
from app.models.billing import Allocation, BillingPeriod, Payment, Reading
from app.models.user import User
from app.services.settlement import guardar_lecturas, liquidar_periodo
from app.utils.auth import role_required

admin_bp = Blueprint("admin", __name__)


@admin_bp.get("/dashboard")
@role_required("ADMIN")
def dashboard():
    total_apartments = Apartment.query.count()
    total_periods = BillingPeriod.query.count()
    pending_allocations = Allocation.query.filter(Allocation.status.in_(["PENDIENTE", "PARCIAL"])).count()
    paid_allocations = Allocation.query.filter_by(status="PAGADO").count()
    total_collected = db.session.query(db.func.coalesce(db.func.sum(Payment.amount_bs), 0)).scalar()
    total_due = db.session.query(db.func.coalesce(db.func.sum(Allocation.amount_due_bs), 0)).scalar()

    return jsonify(
        {
            "ok": True,
            "summary": {
                "total_apartments": total_apartments,
                "total_periods": total_periods,
                "pending_allocations": pending_allocations,
                "paid_allocations": paid_allocations,
                "total_collected_bs": round(total_collected, 2),
                "total_due_bs": round(total_due, 2),
            },
        }
    )


@admin_bp.post("/apartments")
@role_required("ADMIN")
def create_apartment():
    data = request.get_json() or {}
    block = (data.get("block") or "").strip().upper()
    number = (data.get("number") or "").strip()
    owner_name = (data.get("owner_name") or "").strip()
    phone = (data.get("phone") or "").strip() or None
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    meter_code = (data.get("meter_code") or "").strip().upper()
    is_inverted = bool(data.get("is_inverted", False))

    if not all([block, number, owner_name, username, password, meter_code]):
        return jsonify({"ok": False, "message": "Faltan campos obligatorios"}), 400

    if Apartment.query.filter_by(block=block, number=number).first():
        return jsonify({"ok": False, "message": "Ese departamento ya existe"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"ok": False, "message": "El usuario ya existe"}), 400

    if Meter.query.filter_by(code=meter_code).first():
        return jsonify({"ok": False, "message": "El código de medidor ya existe"}), 400

    apartment = Apartment(block=block, number=number, owner_name=owner_name, phone=phone)
    db.session.add(apartment)
    db.session.flush()

    meter = Meter(code=meter_code, apartment_id=apartment.id, is_inverted=is_inverted, is_active=True)
    user = User(username=username, full_name=owner_name, role="OWNER", is_active=True, apartment_id=apartment.id)
    user.set_password(password)

    db.session.add(meter)
    db.session.add(user)
    db.session.commit()

    return jsonify({"ok": True, "message": "Departamento creado", "apartment": apartment.to_dict()}), 201


@admin_bp.get("/apartments")
@role_required("ADMIN")
def list_apartments():
    query = Apartment.query
    block = request.args.get("block")
    search = (request.args.get("search") or "").strip().lower()

    if block:
        query = query.filter_by(block=block.upper())

    apartments = query.order_by(Apartment.block, Apartment.number).all()

    if search:
        apartments = [
            a for a in apartments
            if search in a.owner_name.lower()
            or search in a.number.lower()
            or search in a.block.lower()
            or (a.phone and search in a.phone.lower())
        ]

    return jsonify({"ok": True, "items": [a.to_dict() for a in apartments]})


@admin_bp.get("/blocks")
@role_required("ADMIN")
def list_blocks():
    blocks = db.session.query(Apartment.block).distinct().order_by(Apartment.block).all()
    return jsonify({"ok": True, "items": [b[0] for b in blocks]})


@admin_bp.post("/periods")
@role_required("ADMIN")
def create_period():
    data = request.get_json() or {}
    code = (data.get("code") or "").strip()
    total_common_amount_bs = float(data.get("total_common_amount_bs", 0))
    general_meters_json = data.get("general_meters_json") or []
    general_total_consumption_m3 = float(data.get("general_total_consumption_m3", 0))

    if not code:
        return jsonify({"ok": False, "message": "El código de periodo es obligatorio (ej: 2026-08)"}), 400

    if BillingPeriod.query.filter_by(code=code).first():
        return jsonify({"ok": False, "message": "Ese periodo ya existe"}), 400

    period = BillingPeriod(
        code=code,
        total_common_amount_bs=total_common_amount_bs,
        general_meters_json=general_meters_json,
        general_total_consumption_m3=general_total_consumption_m3,
        status="OPEN",
    )
    db.session.add(period)
    db.session.commit()

    return jsonify({"ok": True, "period": period.to_dict()}), 201


@admin_bp.get("/periods")
@role_required("ADMIN")
def list_periods():
    periods = BillingPeriod.query.order_by(BillingPeriod.code.desc()).all()
    return jsonify({"ok": True, "items": [p.to_dict() for p in periods]})


@admin_bp.get("/periods/<int:period_id>")
@role_required("ADMIN")
def get_period(period_id):
    period = BillingPeriod.query.get_or_404(period_id)
    readings_count = Reading.query.filter_by(period_id=period.id).count()
    allocations_count = Allocation.query.filter_by(period_id=period.id).count()
    return jsonify({
        "ok": True,
        "period": period.to_dict(),
        "readings_count": readings_count,
        "allocations_count": allocations_count,
    })


@admin_bp.post("/periods/<int:period_id>/readings")
@role_required("ADMIN")
def upload_readings(period_id):
    period = BillingPeriod.query.get_or_404(period_id)
    data = request.get_json() or {}
    readings = data.get("readings") or []

    if not readings:
        return jsonify({"ok": False, "message": "Debes enviar al menos una lectura"}), 400

    try:
        registros = guardar_lecturas(period, readings)
        db.session.commit()
    except ValueError as exc:
        db.session.rollback()
        return jsonify({"ok": False, "message": str(exc)}), 400

    return jsonify({"ok": True, "items": [r.to_dict() for r in registros]})


@admin_bp.get("/periods/<int:period_id>/readings")
@role_required("ADMIN")
def get_readings(period_id):
    readings = (
        Reading.query.filter_by(period_id=period_id)
        .join(Apartment)
        .order_by(Apartment.block, Apartment.number)
        .all()
    )
    return jsonify({
        "ok": True,
        "items": [
            {**r.to_dict(), "apartment": r.apartment.to_dict()}
            for r in readings
        ]
    })


@admin_bp.post("/periods/<int:period_id>/settle")
@role_required("ADMIN")
def settle_period(period_id):
    period = BillingPeriod.query.get_or_404(period_id)

    try:
        result = liquidar_periodo(period)
        db.session.commit()
    except ValueError as exc:
        db.session.rollback()
        return jsonify({"ok": False, "message": str(exc)}), 400

    return jsonify({"ok": True, "result": result})


@admin_bp.get("/periods/<int:period_id>/allocations")
@role_required("ADMIN")
def period_allocations(period_id):
    status = request.args.get("status")
    search = (request.args.get("search") or "").strip().lower()
    query = Allocation.query.filter_by(period_id=period_id).join(Apartment)

    if status:
        query = query.filter(Allocation.status == status.upper())

    items = query.order_by(Apartment.block, Apartment.number).all()

    if search:
        items = [
            item for item in items
            if search in item.apartment.owner_name.lower()
            or search in item.apartment.number.lower()
            or search in item.apartment.block.lower()
        ]

    return jsonify({
        "ok": True,
        "items": [
            {**item.to_dict(), "apartment": item.apartment.to_dict()}
            for item in items
        ],
    })


@admin_bp.post("/allocations/<int:allocation_id>/payments")
@role_required("ADMIN")
def register_payment(allocation_id):
    allocation = Allocation.query.get_or_404(allocation_id)
    data = request.get_json() or {}
    amount_bs = float(data.get("amount_bs", 0))
    payment_method = (data.get("payment_method") or "EFECTIVO").strip().upper()
    reference = (data.get("reference") or "").strip() or None
    current_user_id = int(get_jwt_identity())

    if amount_bs <= 0:
        return jsonify({"ok": False, "message": "El monto debe ser mayor que cero"}), 400

    payment = Payment(
        allocation_id=allocation.id,
        amount_bs=amount_bs,
        payment_method=payment_method,
        reference=reference,
        registered_by_user_id=current_user_id,
    )
    allocation.amount_paid_bs = round(allocation.amount_paid_bs + amount_bs, 2)
    allocation.refresh_status()

    db.session.add(payment)
    db.session.commit()

    return jsonify({
        "ok": True,
        "message": "Pago registrado",
        "allocation": {**allocation.to_dict(), "apartment": allocation.apartment.to_dict()},
        "payment": payment.to_dict(),
    })


@admin_bp.get("/search")
@role_required("ADMIN")
def search_global():
    q = (request.args.get("q") or "").strip().lower()
    period_id = request.args.get("period_id", type=int)

    if not q:
        return jsonify({"ok": False, "message": "Debes indicar un valor de búsqueda"}), 400

    apartments = Apartment.query.order_by(Apartment.block, Apartment.number).all()
    matched = [
        a.to_dict() for a in apartments
        if q in a.owner_name.lower()
        or q in a.number.lower()
        or q in a.block.lower()
        or (a.phone and q in a.phone.lower())
    ]

    matched_allocations = []
    if period_id:
        allocations = Allocation.query.filter_by(period_id=period_id).join(Apartment).all()
        matched_allocations = [
            {**a.to_dict(), "apartment": a.apartment.to_dict()}
            for a in allocations
            if q in a.apartment.owner_name.lower()
            or q in a.apartment.number.lower()
            or q in a.apartment.block.lower()
        ]

    return jsonify({"ok": True, "results": {"apartments": matched, "allocations": matched_allocations}})
