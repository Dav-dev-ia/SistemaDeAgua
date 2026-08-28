from flask import Flask, jsonify
from flask_cors import CORS

from app.config import Config
from app.extensions import db, jwt, migrate


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(app, origins=app.config.get("CORS_ORIGINS", "*"))
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)

    from app.models import apartment, billing, user  # noqa: F401
    from app.routes.admin import admin_bp
    from app.routes.auth import auth_bp
    from app.routes.owner import owner_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(owner_bp, url_prefix="/api/owner")

    @app.get("/api/health")
    def health():
        return jsonify({"ok": True, "message": "API AguaPago operativa"})

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"ok": False, "message": "Recurso no encontrado"}), 404

    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({"ok": False, "message": str(error)}), 400

    with app.app_context():
        db.create_all()

    return app
