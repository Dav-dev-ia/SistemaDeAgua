from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity

from app.models.billing import Allocation, Payment
from app.models.user import User
from app.utils.auth import role_required

owner_bp = Blueprint("owner", __name__)


@owner_bp.get("/dashboard")
@role_required("OWNER", "ADMIN")
def owner_dashboard():
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)

    if not user.apartment_id:
        return jsonify({"ok": False, "message": "El usuario no tiene departamento asignado"}), 400

    allocations = (
        Allocation.query.filter_by(apartment_id=user.apartment_id)
        .order_by(Allocation.period_id.desc())
        .all()
    )

    return jsonify(
        {
            "ok": True,
            "owner": user.to_dict(),
            "apartment": user.apartment.to_dict() if user.apartment else None,
            "allocations": [
                {
                    **allocation.to_dict(),
                    "period": allocation.period.to_dict(),
                }
                for allocation in allocations
            ],
        }
    )


@owner_bp.get("/payments")
@role_required("OWNER", "ADMIN")
def owner_payments():
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)

    if not user.apartment_id:
        return jsonify({"ok": False, "message": "El usuario no tiene departamento asignado"}), 400

    period_id = request.args.get("period_id", type=int)
    query = Payment.query.join(Allocation).filter(Allocation.apartment_id == user.apartment_id)

    if period_id:
        query = query.filter(Allocation.period_id == period_id)

    payments = query.order_by(Payment.created_at.desc()).all()

    return jsonify(
        {
            "ok": True,
            "items": [
                {
                    **payment.to_dict(),
                    "allocation": payment.allocation.to_dict(),
                }
                for payment in payments
            ],
        }
    )
