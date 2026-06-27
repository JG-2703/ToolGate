"""
Builds production-like Airwallex callback payloads for load testing.

Generates realistic transaction payloads for:
- Authorization (Stage 1): Initial check if transaction is valid
- Success/Declined Notification (Stage 2): Authorization result
- Clearing (Stage 3): Settlement/finalization

Variable fields per txn: 
  - amount, currency
  - transaction_id, lifecycle_id, card_id
  - merchant info (id, name, city, country, etc.)
  - auth_code, retrieval_ref, network_transaction_id

Decline reasons and their production distribution.
"""
from __future__ import annotations

import random
import secrets
import time
import uuid
from enum import Enum
from datetime import datetime, timezone


class TransactionType(str, Enum):
    AUTHORIZATION = "AUTHORIZATION"
    CLEARING = "CLEARING"
    REFUND = "REFUND"
    REVERSAL = "REVERSAL"


class TransactionStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    FAILED = "FAILED"


class PointOfSaleEntryMode(str, Enum):
    CONTACTLESS_CHIP = "CONTACTLESS_CHIP"
    CHIP = "CHIP"
    MAGNETIC_STRIPE = "MAGNETIC_STRIPE"
    MANUAL = "MANUAL"
    CONTACTLESS_MAGNETIC = "CONTACTLESS_MAGNETIC"


# Decline reasons with production-like weights
DECLINE_REASON_WEIGHTS = {
    "REMOTE_AUTH_DECLINED": 0.50,          # Most common
    "LOW_ACCOUNT_BALANCE": 0.30,           # Second most common
    "SUSPICIOUS_ACTIVITY": 0.10,           # Fraud detection
    "CARD_EXPIRED": 0.05,                  # Card expired
    "TRANSACTION_AMOUNT_EXCEEDS_LIMIT": 0.03,  # Limit breach
    "INVALID_PIN": 0.01,                   # Wrong PIN
    "DUPLICATE_TRANSACTION": 0.01,         # Duplicate detection
}

REMOTE_AUTH_DECLINE_REASONS = {
    "LOW_ACCOUNT_BALANCE": 0.60,
    "SUSPICIOUS_ACTIVITY": 0.20,
    "CARD_EXPIRED": 0.10,
    "TRANSACTION_LIMIT_BREACH": 0.07,
    "LOST_CARD": 0.03,
}

SUCCESS_MESSAGES = {
    "valid transaction",
    "authorized",
    "approved",
    "transaction authorized successfully",
}

POINT_OF_SALE_MODES = [
    PointOfSaleEntryMode.CONTACTLESS_CHIP,
    PointOfSaleEntryMode.CHIP,
    PointOfSaleEntryMode.MAGNETIC_STRIPE,
    PointOfSaleEntryMode.MANUAL,
]


# ── ID GENERATORS ──────────────────────────────────────────────────────────

def gen_lifecycle_id() -> str:
    """Generate Airwallex lifecycle ID (UUID format)."""
    return str(uuid.uuid4())


def gen_transaction_id() -> str:
    """Generate Airwallex transaction ID (UUID format)."""
    return str(uuid.uuid4())


def gen_card_id() -> str:
    """Generate Airwallex card ID (UUID format)."""
    return str(uuid.uuid4())


def gen_auth_code(length: int = 6) -> str:
    """Generate authorization code (e.g., 4V02AL)."""
    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return ''.join(random.choice(chars) for _ in range(length))


def gen_retrieval_ref(length: int = 12) -> str:
    """Generate retrieval reference number."""
    return ''.join(str(random.randint(0, 9)) for _ in range(length))


def gen_network_transaction_id(length: int = 15) -> str:
    """Generate network transaction ID."""
    return ''.join(str(random.randint(0, 9)) for _ in range(length))


def gen_masked_card_number() -> str:
    """Generate masked card number."""
    last_four = ''.join(str(random.randint(0, 9)) for _ in range(4))
    return f"************{last_four}"


def get_current_timestamp() -> str:
    """Get current timestamp in ISO 8601 format with timezone."""
    return datetime.now(timezone.utc).isoformat().replace('+00:00', '+0000')


def get_future_expiry(days: int = 11) -> str:
    """Get expiry date (default 11 days from now)."""
    from datetime import timedelta
    expiry = datetime.now(timezone.utc) + timedelta(days=days)
    return expiry.isoformat().replace('+00:00', '+0000')


def pick_random_decline_reason() -> str:
    """Pick a decline reason weighted by production distribution."""
    reasons = list(DECLINE_REASON_WEIGHTS.keys())
    weights = list(DECLINE_REASON_WEIGHTS.values())
    return random.choices(reasons, weights=weights, k=1)[0]


def pick_random_remote_auth_decline() -> str:
    """Pick a remote auth decline reason."""
    reasons = list(REMOTE_AUTH_DECLINE_REASONS.keys())
    weights = list(REMOTE_AUTH_DECLINE_REASONS.values())
    return random.choices(reasons, weights=weights, k=1)[0]


def pick_random_entry_mode() -> str:
    """Pick a random POS entry mode."""
    return random.choice(POINT_OF_SALE_MODES).value


# ── MERCHANT BUILDERS ──────────────────────────────────────────────────────

def build_merchant(
    merchant_id: str = "479338004883977",
    merchant_name: str = "SHERWIN-WILLIAMS721164",
    city: str = "Franklin",
    country: str = "USA",
    state: str = "WI",
    postcode: str = "53132",
    category_code: str = "8661",
) -> dict:
    """Build merchant detail object."""
    return {
        "id": merchant_id,
        "name": merchant_name,
        "city": city,
        "country": country,
        "state": state,
        "postcode": postcode,
        "category_code": category_code,
    }


# ── AUTHORIZATION PAYLOAD ─────────────────────────────────────────────────

def build_authorization(
    amount: float,
    card_id: str,
    account_id: str = "acct_FeP32PtROAW5G1qWXYAmQA",
    currency: str = "USD",
    merchant: dict | None = None,
    auth_code: str | None = None,
    entry_mode: str | None = None,
) -> dict:
    """
    Build Stage 1: Authorization payload.
    
    This is the initial authorization request before we know if it will pass/fail.
    """
    if merchant is None:
        merchant = build_merchant()
    
    if auth_code is None:
        auth_code = gen_auth_code()
    
    if entry_mode is None:
        entry_mode = pick_random_entry_mode()
    
    lifecycle_id = gen_lifecycle_id()
    transaction_id = gen_transaction_id()
    
    return {
        "account_id": account_id,
        "card_id": card_id,
        "transaction_id": transaction_id,
        "transaction_type": TransactionType.AUTHORIZATION.value,
        "transaction_date": get_current_timestamp(),
        "transaction_amount": amount,
        "transaction_currency": currency,
        "merchant": merchant,
        "auth_code": auth_code,
        "masked_card_number": gen_masked_card_number(),
        "retrieval_ref": gen_retrieval_ref(),
        "card_nickname": f"Card-{card_id[-4:]}",
        "network_transaction_id": gen_network_transaction_id(),
        "billing_order": [
            {
                "currency": currency,
                "amount": amount,
            }
        ],
        "acquiring_institution_id": "479338",
        "risk_details": {
            "risk_factors": [],
            "risk_actions_performed": [],
            "three_d_secure_outcome": "NOT_APPLICABLE",
        },
        "transaction_category": "PURCHASE",
        "point_of_sale": {
            "entry_mode": entry_mode,
            "condition_code": "NORMAL",
        },
        "expiry_date": get_future_expiry(),
        "digital_wallet_token_id": "[FILTERED]",
        "lifecycle_id": lifecycle_id,
        "card_transaction_lifecycle_id": lifecycle_id,
        "card_transaction_id": lifecycle_id,
        "card_transaction_event_id": lifecycle_id,
        # Meta for internal tracking (optional)
        "_meta": {
            "lifecycle_id": lifecycle_id,
            "transaction_id": transaction_id,
            "auth_code": auth_code,
        }
    }


# ── SUCCESS NOTIFICATION (Stage 2A) ────────────────────────────────────────

def build_success_notification(
    amount: float,
    lifecycle_id: str,
    transaction_id: str,
    card_id: str,
    account_id: str = "acct_FeP32PtROAW5G1qWXYAmQA",
    currency: str = "USD",
    merchant: dict | None = None,
    auth_code: str | None = None,
    remote_auth_duration: int | None = None,
) -> dict:
    """
    Build Stage 2A: Authorization Success Notification.
    
    This indicates the authorization was successful and we should create an expense.
    """
    if merchant is None:
        merchant = build_merchant()
    
    if auth_code is None:
        auth_code = gen_auth_code()
    
    if remote_auth_duration is None:
        remote_auth_duration = random.randint(100, 300)
    
    return {
        "id": gen_transaction_id(),
        "name": "issuing.transaction.succeeded",
        "account_id": account_id,
        "data": {
            "acquiring_institution_identifier": "479338",
            "auth_code": auth_code,
            "billing_amount": -amount,  # Negative in notification stage
            "billing_currency": currency,
            "card_id": card_id,
            "card_nickname": f"Card-{card_id[-4:]}",
            "failure_reason": None,
            "lifecycle_id": lifecycle_id,
            "masked_card_number": gen_masked_card_number(),
            "merchant": {
                "category_code": merchant.get("category_code", "5231"),
                "city": merchant.get("city", "Franklin"),
                "country": merchant.get("country", "USA"),
                "identifier": merchant.get("id", "479338004883977"),
                "name": merchant.get("name", "SHERWIN-WILLIAMS721164"),
                "postcode": merchant.get("postcode", "53132"),
                "state": merchant.get("state", "WI"),
            },
            "network_transaction_id": gen_network_transaction_id(),
            "posted_date": get_current_timestamp(),
            "remote_auth": {
                "default_action_used": False,
                "duration": remote_auth_duration,
                "response_status": "AUTHORIZED",
                "status_reason": random.choice(list(SUCCESS_MESSAGES)),
                "timed_out": False,
            },
            "retrieval_ref": gen_retrieval_ref(),
            "risk_details": {
                "risk_actions_performed": [],
                "risk_factors": [],
                "three_d_secure_outcome": "NOT_APPLICABLE",
            },
            "status": TransactionStatus.PENDING.value,
            "transaction_amount": -amount,  # Negative
            "transaction_currency": currency,
            "transaction_date": get_current_timestamp(),
            "transaction_id": transaction_id,
            "transaction_type": TransactionType.AUTHORIZATION.value,
        },
        "created_at": get_current_timestamp(),
        "version": "2024-08-07",
    }


# ── DECLINE NOTIFICATION (Stage 2B) ────────────────────────────────────────

def build_decline_notification(
    amount: float,
    lifecycle_id: str,
    transaction_id: str,
    card_id: str,
    account_id: str = "acct_FeP32PtROAW5G1qWXYAmQA",
    currency: str = "USD",
    merchant: dict | None = None,
    auth_code: str | None = None,
    decline_reason: str | None = None,
    remote_auth_duration: int | None = None,
) -> dict:
    """
    Build Stage 2B: Authorization Declined Notification.
    
    This indicates the authorization failed and we should mark the expense as declined.
    """
    if merchant is None:
        merchant = build_merchant()
    
    if auth_code is None:
        auth_code = gen_auth_code()
    
    if decline_reason is None:
        decline_reason = pick_random_decline_reason()
    
    if remote_auth_duration is None:
        remote_auth_duration = random.randint(50, 150)
    
    return {
        "id": gen_transaction_id(),
        "name": "issuing.transaction.failed",
        "account_id": account_id,
        "data": {
            "acquiring_institution_identifier": "479338",
            "auth_code": auth_code,
            "billing_amount": -amount,  # Negative in notification stage
            "billing_currency": currency,
            "card_id": card_id,
            "card_nickname": f"Card-{card_id[-4:]}",
            "failure_reason": "REMOTE_AUTH_DECLINED",
            "lifecycle_id": lifecycle_id,
            "masked_card_number": gen_masked_card_number(),
            "merchant": {
                "category_code": merchant.get("category_code", "5231"),
                "city": merchant.get("city", "Franklin"),
                "country": merchant.get("country", "USA"),
                "identifier": merchant.get("id", "479338004883977"),
                "name": merchant.get("name", "SHERWIN-WILLIAMS721164"),
                "postcode": merchant.get("postcode", "53132"),
                "state": merchant.get("state", "WI"),
            },
            "network_transaction_id": gen_network_transaction_id(),
            "posted_date": get_current_timestamp(),
            "remote_auth": {
                "default_action_used": False,
                "duration": remote_auth_duration,
                "response_status": "DECLINED",
                "status_reason": decline_reason,
                "timed_out": False,
            },
            "retrieval_ref": gen_retrieval_ref(),
            "risk_details": {
                "risk_actions_performed": [],
                "risk_factors": [],
                "three_d_secure_outcome": "NOT_APPLICABLE",
            },
            "status": TransactionStatus.FAILED.value,
            "transaction_amount": -amount,  # Negative
            "transaction_currency": currency,
            "transaction_date": get_current_timestamp(),
            "transaction_id": transaction_id,
            "transaction_type": TransactionType.AUTHORIZATION.value,
        },
        "created_at": get_current_timestamp(),
        "version": "2024-08-07",
    }


# ── CLEARING NOTIFICATION (Stage 3) ────────────────────────────────────────

def build_clearing_notification(
    amount: float,
    lifecycle_id: str,
    matched_auth_id: str,
    card_id: str,
    account_id: str = "acct_FeP32PtROAW5G1qWXYAmQA",
    currency: str = "USD",
    merchant: dict | None = None,
) -> dict:
    """
    Build Stage 3: Clearing Notification.
    
    This indicates the transaction has been cleared/settled on the network.
    Only sent if the authorization was successful.
    """
    if merchant is None:
        merchant = build_merchant()
    
    clearing_transaction_id = gen_transaction_id()
    
    return {
        "id": gen_transaction_id(),
        "name": "issuing.transaction.succeeded",
        "account_id": account_id,
        "data": {
            "acquiring_institution_identifier": "479338",
            "billing_amount": -amount,  # Negative
            "billing_currency": currency,
            "card_id": card_id,
            "card_nickname": f"Card-{card_id[-4:]}",
            "failure_reason": None,
            "lifecycle_id": lifecycle_id,
            "masked_card_number": gen_masked_card_number(),
            "matched_authorizations": [matched_auth_id],  # Links back to auth
            "merchant": {
                "category_code": merchant.get("category_code", "5231"),
                "city": merchant.get("city", "Franklin"),
                "country": merchant.get("country", "USA"),
                "identifier": merchant.get("id", "479338004883977"),
                "name": merchant.get("name", "SHERWIN-WILLIAMS721164"),
                "postcode": merchant.get("postcode", "53132"),
                "state": merchant.get("state", "WI"),
            },
            "network_transaction_id": gen_network_transaction_id(),
            "posted_date": get_current_timestamp(),
            "posted_at": get_current_timestamp(),
            "retrieval_ref": gen_retrieval_ref(),
            "risk_details": {
                "risk_actions_performed": [],
                "risk_factors": [],
                "three_d_secure_outcome": "NOT_APPLICABLE",
            },
            "status": TransactionStatus.APPROVED.value,
            "transaction_amount": -amount,  # Negative
            "transaction_currency": currency,
            "transaction_date": get_current_timestamp(),
            "transaction_id": clearing_transaction_id,
            "transaction_type": TransactionType.CLEARING.value,  # Different type
        },
        "created_at": get_current_timestamp(),
        "version": "2024-08-07",
    }


# ── REFUND NOTIFICATION ────────────────────────────────────────────────────

def build_refund_notification(
    amount: float,
    lifecycle_id: str,
    matched_auth_id: str,
    card_id: str,
    account_id: str = "acct_FeP32PtROAW5G1qWXYAmQA",
    currency: str = "USD",
    merchant: dict | None = None,
) -> dict:
    """
    Build Refund Notification (transaction_type: REFUND).

    Processed by process_clearing_notification — same path as CLEARING.
    billing_amount is positive (credit back to card).
    transaction_amount *= -1 is applied in Ruby so we send positive here.
    """
    if merchant is None:
        merchant = build_merchant()

    return {
        "id": gen_transaction_id(),
        "name": "issuing.transaction.succeeded",
        "account_id": account_id,
        "data": {
            "acquiring_institution_identifier": "479338",
            "billing_amount": amount,          # Positive — credit back
            "billing_currency": currency,
            "card_id": card_id,
            "card_nickname": f"Card-{card_id[-4:]}",
            "failure_reason": None,
            "lifecycle_id": lifecycle_id,
            "masked_card_number": gen_masked_card_number(),
            "matched_authorizations": [matched_auth_id],
            "merchant": {
                "category_code": merchant.get("category_code", "5231"),
                "city": merchant.get("city", "Franklin"),
                "country": merchant.get("country", "USA"),
                "identifier": merchant.get("id", "479338004883977"),
                "name": merchant.get("name", "SHERWIN-WILLIAMS721164"),
                "postcode": merchant.get("postcode", "53132"),
                "state": merchant.get("state", "WI"),
            },
            "network_transaction_id": gen_network_transaction_id(),
            "posted_date": get_current_timestamp(),
            "posted_at": get_current_timestamp(),
            "retrieval_ref": gen_retrieval_ref(),
            "risk_details": {
                "risk_actions_performed": [],
                "risk_factors": [],
                "three_d_secure_outcome": "NOT_APPLICABLE",
            },
            "status": TransactionStatus.APPROVED.value,
            "transaction_amount": amount,      # Positive — credit back
            "transaction_currency": currency,
            "transaction_date": get_current_timestamp(),
            "transaction_id": gen_transaction_id(),
            "transaction_type": TransactionType.REFUND.value,
        },
        "created_at": get_current_timestamp(),
        "version": "2024-08-07",
    }


# ── REVERSAL NOTIFICATION ──────────────────────────────────────────────────

def build_reversal_notification(
    amount: float,
    lifecycle_id: str,
    matched_auth_id: str,
    card_id: str,
    account_id: str = "acct_FeP32PtROAW5G1qWXYAmQA",
    currency: str = "USD",
    merchant: dict | None = None,
) -> dict:
    """
    Build Reversal Notification (transaction_type: REVERSAL).

    Processed by process_reversal_notification — schedules
    GenerateReversalExpenseJob. Voids an unsettled authorization.
    billing_amount is positive (funds released back).
    """
    if merchant is None:
        merchant = build_merchant()

    return {
        "id": gen_transaction_id(),
        "name": "issuing.transaction.succeeded",
        "account_id": account_id,
        "data": {
            "acquiring_institution_identifier": "479338",
            "billing_amount": amount,          # Positive — auth voided
            "billing_currency": currency,
            "card_id": card_id,
            "card_nickname": f"Card-{card_id[-4:]}",
            "failure_reason": None,
            "lifecycle_id": lifecycle_id,
            "masked_card_number": gen_masked_card_number(),
            "matched_authorizations": [matched_auth_id],
            "merchant": {
                "category_code": merchant.get("category_code", "5231"),
                "city": merchant.get("city", "Franklin"),
                "country": merchant.get("country", "USA"),
                "identifier": merchant.get("id", "479338004883977"),
                "name": merchant.get("name", "SHERWIN-WILLIAMS721164"),
                "postcode": merchant.get("postcode", "53132"),
                "state": merchant.get("state", "WI"),
            },
            "network_transaction_id": gen_network_transaction_id(),
            "posted_date": get_current_timestamp(),
            "posted_at": get_current_timestamp(),
            "retrieval_ref": gen_retrieval_ref(),
            "risk_details": {
                "risk_actions_performed": [],
                "risk_factors": [],
                "three_d_secure_outcome": "NOT_APPLICABLE",
            },
            "status": TransactionStatus.APPROVED.value,
            "transaction_amount": amount,      # Positive — auth voided
            "transaction_currency": currency,
            "transaction_date": get_current_timestamp(),
            "transaction_id": gen_transaction_id(),
            "transaction_type": TransactionType.REVERSAL.value,
        },
        "created_at": get_current_timestamp(),
        "version": "2024-08-07",
    }


# ── CONVENIENCE BUILDERS ───────────────────────────────────────────────────

def build_complete_flow(
    amount: float,
    card_id: str,
    account_id: str = "acct_FeP32PtROAW5G1qWXYAmQA",
    currency: str = "USD",
    merchant: dict | None = None,
    auth_code: str | None = None,
) -> dict:
    """
    Build complete successful flow: Authorization → Success → Clearing.
    
    Returns a dict with all three payloads and metadata for tracking.
    """
    if merchant is None:
        merchant = build_merchant()
    
    if auth_code is None:
        auth_code = gen_auth_code()
    
    # Stage 1: Authorization
    auth_payload = build_authorization(
        amount=amount,
        card_id=card_id,
        account_id=account_id,
        currency=currency,
        merchant=merchant,
        auth_code=auth_code,
    )
    
    lifecycle_id = auth_payload["lifecycle_id"]
    transaction_id = auth_payload["transaction_id"]
    
    # Stage 2A: Success
    success_payload = build_success_notification(
        amount=amount,
        lifecycle_id=lifecycle_id,
        transaction_id=transaction_id,
        card_id=card_id,
        account_id=account_id,
        currency=currency,
        merchant=merchant,
        auth_code=auth_code,
    )
    
    # Stage 3: Clearing
    # clearing_payload = build_clearing_notification(
    #     amount=amount,
    #     lifecycle_id=lifecycle_id,
    #     matched_auth_id=transaction_id,
    #     card_id=card_id,
    #     account_id=account_id,
    #     currency=currency,
    #     merchant=merchant,
    # )
    
    return {
        "lifecycle_id": lifecycle_id,
        "transaction_id": transaction_id,
        "auth_code": auth_code,
        "amount": amount,
        "currency": currency,
        "card_id": card_id,
        "account_id": account_id,
        "payloads": {
            "authorization": auth_payload,
            "success": success_payload,
            # "clearing": clearing_payload,b
        }
    }


def build_decline_flow(
    amount: float,
    card_id: str,
    account_id: str = "acct_FeP32PtROAW5G1qWXYAmQA",
    currency: str = "USD",
    merchant: dict | None = None,
    auth_code: str | None = None,
    decline_reason: str | None = None,
) -> dict:
    """
    Build decline flow: Authorization → Declined.
    
    Returns a dict with both payloads and metadata for tracking.
    """
    if merchant is None:
        merchant = build_merchant()
    
    if auth_code is None:
        auth_code = gen_auth_code()
    
    if decline_reason is None:
        decline_reason = pick_random_decline_reason()
    
    # Stage 1: Authorization
    auth_payload = build_authorization(
        amount=amount,
        card_id=card_id,
        account_id=account_id,
        currency=currency,
        merchant=merchant,
        auth_code=auth_code,
    )
    
    lifecycle_id = auth_payload["lifecycle_id"]
    transaction_id = auth_payload["transaction_id"]
    
    # Stage 2B: Declined
    decline_payload = build_decline_notification(
        amount=amount,
        lifecycle_id=lifecycle_id,
        transaction_id=transaction_id,
        card_id=card_id,
        account_id=account_id,
        currency=currency,
        merchant=merchant,
        auth_code=auth_code,
        decline_reason=decline_reason,
    )
    
    return {
        "lifecycle_id": lifecycle_id,
        "transaction_id": transaction_id,
        "auth_code": auth_code,
        "amount": amount,
        "currency": currency,
        "card_id": card_id,
        "account_id": account_id,
        "decline_reason": decline_reason,
        "payloads": {
            "authorization": auth_payload,
            "declined": decline_payload,
        }
    }


# ── BATCH GENERATORS ───────────────────────────────────────────────────────

def generate_test_transactions(
    count: int = 10,
    amount_base: float = 100,
    amount_variance: float = 40,
    card_id: str | None = None,
    account_id: str = "acct_FeP32PtROAW5G1qWXYAmQA",
    merchant: dict | None = None,
    success_rate: float = 0.80,  # 80% success, 20% decline
) -> list[dict]:
    """
    Generate multiple test transactions.
    
    Args:
        count: Number of transactions to generate
        amount_base: Base amount (will vary ±variance)
        amount_variance: Amount variance
        card_id: Card ID (generated if not provided)
        account_id: Account ID
        merchant: Merchant details dict
        success_rate: Fraction of txns that should succeed (0.0-1.0)
    
    Returns:
        List of transaction flow dicts (either complete or decline)
    """
    if merchant is None:
        merchant = build_merchant()
    
    if card_id is None:
        card_id = gen_card_id()
    
    transactions = []
    
    for _ in range(count):
        # Randomize amount
        amount = max(1, amount_base + random.uniform(-amount_variance, amount_variance))
        amount = round(amount, 2)
        
        # Decide success/decline
        should_succeed = random.random() < success_rate
        
        if should_succeed:
            txn = build_complete_flow(
                amount=amount,
                card_id=card_id,
                account_id=account_id,
                merchant=merchant,
            )
        else:
            txn = build_decline_flow(
                amount=amount,
                card_id=card_id,
                account_id=account_id,
                merchant=merchant,
            )
        
        transactions.append(txn)
    
    return transactions