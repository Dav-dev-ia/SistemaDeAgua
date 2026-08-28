from datetime import datetime, UTC

from app.extensions import db


class BillingPeriod(db.Model):
    __tablename__ = "billing_periods"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(7), unique=True, nullable=False, index=True)
    total_common_amount_bs = db.Column(db.Float, nullable=False, default=0)
    general_meters_json = db.Column(db.JSON, nullable=True)
    general_total_consumption_m3 = db.Column(db.Float, nullable=False, default=0)
    total_individual_consumption_m3 = db.Column(db.Float, nullable=False, default=0)
    common_difference_m3 = db.Column(db.Float, nullable=False, default=0)
    distributed_total_bs = db.Column(db.Float, nullable=False, default=0)
    status = db.Column(db.String(20), nullable=False, default="OPEN")
    notes_json = db.Column(db.JSON, nullable=True)
    closed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(UTC), nullable=False)

    readings = db.relationship("Reading", back_populates="period", lazy=True, cascade="all, delete-orphan")
    allocations = db.relationship("Allocation", back_populates="period", lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "total_common_amount_bs": self.total_common_amount_bs,
            "general_meters_json": self.general_meters_json or [],
            "general_total_consumption_m3": self.general_total_consumption_m3,
            "total_individual_consumption_m3": self.total_individual_consumption_m3,
            "common_difference_m3": self.common_difference_m3,
            "distributed_total_bs": self.distributed_total_bs,
            "status": self.status,
            "notes_json": self.notes_json or {},
        }


class Reading(db.Model):
    __tablename__ = "readings"
    __table_args__ = (
        db.UniqueConstraint("period_id", "meter_id", name="uq_period_meter"),
    )

    id = db.Column(db.Integer, primary_key=True)
    period_id = db.Column(db.Integer, db.ForeignKey("billing_periods.id"), nullable=False)
    apartment_id = db.Column(db.Integer, db.ForeignKey("apartments.id"), nullable=False)
    meter_id = db.Column(db.Integer, db.ForeignKey("meters.id"), nullable=False)
    previous_reading = db.Column(db.Float, nullable=False)
    current_reading = db.Column(db.Float, nullable=False)
    consumption_m3 = db.Column(db.Float, nullable=False)
    captured_at = db.Column(db.DateTime, default=lambda: datetime.now(UTC), nullable=False)
    source_json = db.Column(db.JSON, nullable=True)

    period = db.relationship("BillingPeriod", back_populates="readings")
    apartment = db.relationship("Apartment", back_populates="readings")
    meter = db.relationship("Meter", back_populates="readings")

    def to_dict(self):
        return {
            "id": self.id,
            "period_id": self.period_id,
            "apartment_id": self.apartment_id,
            "meter_id": self.meter_id,
            "previous_reading": self.previous_reading,
            "current_reading": self.current_reading,
            "consumption_m3": self.consumption_m3,
        }


class Allocation(db.Model):
    __tablename__ = "allocations"
    __table_args__ = (
        db.UniqueConstraint("period_id", "apartment_id", name="uq_period_apartment"),
    )

    id = db.Column(db.Integer, primary_key=True)
    period_id = db.Column(db.Integer, db.ForeignKey("billing_periods.id"), nullable=False)
    apartment_id = db.Column(db.Integer, db.ForeignKey("apartments.id"), nullable=False)
    consumption_m3 = db.Column(db.Float, nullable=False, default=0)
    percentage_share = db.Column(db.Float, nullable=False, default=0)
    amount_due_bs = db.Column(db.Float, nullable=False, default=0)
    amount_paid_bs = db.Column(db.Float, nullable=False, default=0)
    status = db.Column(db.String(20), nullable=False, default="PENDIENTE")
    breakdown_json = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(UTC), nullable=False)
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(UTC), nullable=False)

    period = db.relationship("BillingPeriod", back_populates="allocations")
    apartment = db.relationship("Apartment", back_populates="allocations")
    payments = db.relationship("Payment", back_populates="allocation", lazy=True, cascade="all, delete-orphan")

    def refresh_status(self):
        if self.amount_paid_bs <= 0:
            self.status = "PENDIENTE"
        elif self.amount_paid_bs < self.amount_due_bs:
            self.status = "PARCIAL"
        else:
            self.status = "PAGADO"

    def to_dict(self):
        return {
            "id": self.id,
            "period_id": self.period_id,
            "apartment_id": self.apartment_id,
            "consumption_m3": self.consumption_m3,
            "percentage_share": self.percentage_share,
            "amount_due_bs": round(self.amount_due_bs, 2),
            "amount_paid_bs": round(self.amount_paid_bs, 2),
            "pending_amount_bs": round(max(self.amount_due_bs - self.amount_paid_bs, 0), 2),
            "status": self.status,
            "breakdown_json": self.breakdown_json or {},
        }


class Payment(db.Model):
    __tablename__ = "payments"

    id = db.Column(db.Integer, primary_key=True)
    allocation_id = db.Column(db.Integer, db.ForeignKey("allocations.id"), nullable=False)
    amount_bs = db.Column(db.Float, nullable=False)
    payment_method = db.Column(db.String(20), nullable=False, default="EFECTIVO")
    reference = db.Column(db.String(120), nullable=True)
    notes_json = db.Column(db.JSON, nullable=True)
    registered_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(UTC), nullable=False)

    allocation = db.relationship("Allocation", back_populates="payments")

    def to_dict(self):
        return {
            "id": self.id,
            "allocation_id": self.allocation_id,
            "amount_bs": round(self.amount_bs, 2),
            "payment_method": self.payment_method,
            "reference": self.reference,
            "registered_by_user_id": self.registered_by_user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
