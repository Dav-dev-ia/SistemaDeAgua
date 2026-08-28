from datetime import datetime, UTC

from app.extensions import db


class Apartment(db.Model):
    __tablename__ = "apartments"
    __table_args__ = (
        db.UniqueConstraint("block", "number", name="uq_apartment_block_number"),
    )

    id = db.Column(db.Integer, primary_key=True)
    block = db.Column(db.String(20), nullable=False, index=True)
    number = db.Column(db.String(20), nullable=False, index=True)
    owner_name = db.Column(db.String(150), nullable=False)
    phone = db.Column(db.String(30), nullable=True)
    coefficient = db.Column(db.Float, nullable=False, default=1.0)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(UTC), nullable=False)

    users = db.relationship("User", back_populates="apartment", lazy=True)
    meters = db.relationship("Meter", back_populates="apartment", lazy=True, cascade="all, delete-orphan")
    readings = db.relationship("Reading", back_populates="apartment", lazy=True)
    allocations = db.relationship("Allocation", back_populates="apartment", lazy=True)

    def label(self) -> str:
        return f"Bloque {self.block} - Dpto {self.number}"

    def to_dict(self):
        meter = self.meters[0] if self.meters else None
        return {
            "id": self.id,
            "block": self.block,
            "number": self.number,
            "owner_name": self.owner_name,
            "phone": self.phone,
            "coefficient": self.coefficient,
            "is_active": self.is_active,
            "meter": meter.to_dict() if meter else None,
        }


class Meter(db.Model):
    __tablename__ = "meters"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(50), unique=True, nullable=False, index=True)
    apartment_id = db.Column(db.Integer, db.ForeignKey("apartments.id"), nullable=False)
    is_inverted = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    metadata_json = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(UTC), nullable=False)

    apartment = db.relationship("Apartment", back_populates="meters")
    readings = db.relationship("Reading", back_populates="meter", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "apartment_id": self.apartment_id,
            "is_inverted": self.is_inverted,
            "is_active": self.is_active,
        }
