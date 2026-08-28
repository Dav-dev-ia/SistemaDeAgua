from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token

from app.extensions import db
from app.models.user import User

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/login")
def login():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or not password:
        return jsonify({"ok": False, "message": "Usuario y contraseña son obligatorios"}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password) or not user.is_active:
        return jsonify({"ok": False, "message": "Credenciales inválidas"}), 401

    token = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role, "username": user.username},
    )

    return jsonify(
        {
            "ok": True,
            "access_token": token,
            "user": user.to_dict(),
        }
    )


@auth_bp.post("/register")
def register():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    full_name = (data.get("full_name") or "").strip()
    password = (data.get("password") or "").strip()
    block = (data.get("block") or "").strip().upper()
    number = (data.get("number") or "").strip()

    if not all([username, full_name, password, block, number]):
        return jsonify({"ok": False, "message": "Todos los campos son obligatorios"}), 400

    if len(password) < 6:
        return jsonify({"ok": False, "message": "La contraseña debe tener al menos 6 caracteres"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"ok": False, "message": "El usuario ya existe"}), 400

    from app.models.apartment import Apartment
    apartment = Apartment.query.filter_by(block=block, number=number).first()
    if not apartment:
        return jsonify({"ok": False, "message": "No existe el departamento indicado. Contacta al administrador."}), 400

    existing_user = User.query.filter_by(apartment_id=apartment.id, role="OWNER").first()
    if existing_user:
        return jsonify({"ok": False, "message": "Ese departamento ya tiene un usuario registrado"}), 400

    user = User(username=username, full_name=full_name, role="OWNER", is_active=True, apartment_id=apartment.id)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return jsonify({"ok": True, "message": "Cuenta creada correctamente", "user": user.to_dict()}), 201


@auth_bp.post("/bootstrap-admin")
def bootstrap_admin():
    if User.query.filter_by(role="ADMIN").first():
        return jsonify({"ok": False, "message": "Ya existe un usuario administrador"}), 400

    data = request.get_json() or {}
    username = (data.get("username") or "admin").strip()
    full_name = (data.get("full_name") or "Administrador General").strip()
    password = (data.get("password") or "").strip()

    if len(password) < 6:
        return jsonify({"ok": False, "message": "La contraseña debe tener al menos 6 caracteres"}), 400

    user = User(username=username, full_name=full_name, role="ADMIN", is_active=True)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return jsonify({"ok": True, "message": "Administrador creado correctamente", "user": user.to_dict()}), 201
