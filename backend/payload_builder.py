"""
Builds exact production PineLabs callback payloads for Card and UPI transactions.

Variable fields per txn: amount, txn_unique_id, batch_id, transaction_id, approval_code,
notification_unique_id, txn_time, transfer_card_balance.
Card-specific variables: card_ref, rrn.
UPI-specific variables: payee_vpa, invoice_number, upi_txn_type.
"""
from __future__ import annotations

import random
import secrets
import time
from enum import IntEnum


class TxnType(IntEnum):
    DEBIT = 2
    VOID = 9
    REFUND = 17
    REVERSAL = 18
    SURCHARGE_REVERSAL = 21
    CASH_WITHDRAWAL = 34
    UPI_REFUND = 23

NOTIF_MESSAGES = {
    "success":           "Transaction successful.",
    "auth_failed":       "Transaction Authorization Failed.",
    "cool_off":          "Transaction cannot be performed during the cool off period.",
    "not_processed":     "Transaction is not processed.",
    "already_cancelled": "Transaction is already cancelled.",
    "txn_id_failed":     "Transaction Id check failed.",
}

# Real Indian merchant names (name, city) for realistic randomized payloads.
INDIAN_MERCHANTS = [
    ("RAPIDO", "BANGALORE"),
    ("OLA CABS", "BANGALORE"),
    ("UBER INDIA", "GURGAON"),
    ("SWIGGY", "BANGALORE"),
    ("ZOMATO", "GURGAON"),
    ("FLIPKART", "BANGALORE"),
    ("AMAZON INDIA", "BANGALORE"),
    ("MYNTRA", "BANGALORE"),
    ("BIGBASKET", "BANGALORE"),
    ("BLINKIT", "GURGAON"),
    ("ZEPTO", "MUMBAI"),
    ("DUNZO", "BANGALORE"),
    ("RELIANCE FRESH", "MUMBAI"),
    ("DMART", "MUMBAI"),
    ("MORE SUPERMARKET", "BANGALORE"),
    ("TATA CLIQ", "MUMBAI"),
    ("NYKAA", "MUMBAI"),
    ("MAKEMYTRIP", "GURGAON"),
    ("IRCTC", "NEW DELHI"),
    ("REDBUS", "BANGALORE"),
    ("BOOKMYSHOW", "MUMBAI"),
    ("PHONEPE", "PUNE"),
    ("PAYTM", "NOIDA"),
    ("APOLLO PHARMACY", "CHENNAI"),
    ("CROMA", "MUMBAI"),
    ("LENSKART", "GURGAON"),
    ("URBAN COMPANY", "GURGAON"),
    ("HALDIRAM", "NEW DELHI"),
    ("CAFE COFFEE DAY", "BANGALORE"),
    ("DECATHLON INDIA", "BANGALORE"),
]


def gen_merchant() -> tuple[str, str]:
    """Random (merchantName, city) from Indian merchant list."""
    return random.choice(INDIAN_MERCHANTS)


DECLINE_REASON_WEIGHTS = {
    "low_account_balance":       0.773,
    "low_card_balance":          0.190,
    "transaction_limit_breach":  0.018,
    "low_budget_balance":        0.014,
    "upi_activation_limit_breach": 0.004,
    "upi_merchant_not_allowed":  0.001,
}


def gen_rrn() -> str:
    return str(random.randint(100_000_000_000, 999_999_999_999))


def gen_txn_unique_id() -> int:
    return int(time.time() * 1000) + random.randint(0, 9999)


def gen_batch_id() -> int:
    return random.randint(10_000_000, 99_999_999)


def gen_transaction_id() -> int:
    return random.randint(10_000_000, 2_999_999_999)


def gen_approval_code() -> str:
    return str(random.randint(1_000_000_000, 9_999_999_999))


def gen_upi_invoice() -> str:
    return "PILMP" + secrets.token_hex(16)


def gen_transfer_balance() -> float:
    return round(random.uniform(100_000, 5_000_000), 2)


# ── CARD ───────────────────────────────────────────────────────────────────────

def build_card_auth(card_ref: str, rrn: str, amount: float, txn_unique_id: int, mcc: str = "6011") -> dict:
    """Card authorization payload. amount in rupees."""
    merchant_name, merchant_city = gen_merchant()
    return {
        "accountDetails": None,
        "cardDetail": {
            "cardNumber": "6204430025899918",
            "expenseCategory": None,
            "expenseCategoryService": None,
            "externalAccountNumber": None,
            "externalCardIdentifier": "volopayinpinelabs-1",
            "geoLocation": {
                "ip": "202.179.159.84",
                "latitude": None,
                "longitude": None,
            },
            "maskedCardNumber": "608363******1867",
            "referenceNumber": str(card_ref),
        },
        "merchantDetail": {
            "city": merchant_city,
            "mcc": str(mcc),
            "merchantName": merchant_name,
            "mid": "000hdfc70039908",
            "payeeVPA": None,
            "tId": "70039908",
        },
        "transactionDetail": {
            "batchId": gen_batch_id(),
            "feeType": None,
            "feeTypeName": None,
            "fromPocketType": None,
            "invoiceNumber": f"RRN:{rrn}",
            "loadType": None,
            "rrn": rrn,
            "toPocketType": None,
            "transactionAmount": amount,
            "transactionId": gen_transaction_id(),
            "transactionMode": 3,
            "transactionType": 2,
        },
        "transactionUniqueId": txn_unique_id,
    }


def build_card_notification(
    card_ref: str,
    rrn: str,
    amount: float,
    txn_unique_id: int,
    notification_unique_id: int,
    txn_time: str,
    mcc: str = "6011",
    txn_type: int = 2,
    reason_code: int = 0,
    message: str = "Transaction successful.",
) -> dict:
    """Card notification payload. amount in rupees (same as auth — no unit conversion)."""
    merchant_name, merchant_city = gen_merchant()
    return {
        "accountDetails": None,
        "cardDetail": {
            "cardNumber": "6204430025899918",
            "expenseCategory": None,
            "expenseCategoryService": None,
            "externalAccountNumber": None,
            "externalCardIdentifier": "volopayinpinelabs-1",
            "geoLocation": {
                "ip": "202.179.159.84",
                "latitude": None,
                "longitude": None,
            },
            "maskedCardNumber": "608363******1867",
            "referenceNumber": str(card_ref),
        },
        "merchantDetail": {
            "city": merchant_city,
            "mcc": str(mcc),
            "merchantName": merchant_name,
            "mid": "000hdfc70039908",
            "payeeVPA": None,
            "tId": "70039908",
        },
        "notificationUniqueId": notification_unique_id,
        "transactionDetail": {
            "approvalCode": gen_approval_code(),
            "batchId": gen_batch_id(),
            "feeType": None,
            "feeTypeName": None,
            "fromPocketType": None,
            "invoiceNumber": f"RRN:{rrn}",
            "loadType": None,
            "merchantName": "PL-IPPS-CN-Volopay",
            "message": message,
            "notes": '{"ppTxnType":2,"gstAmount":0}',
            "reasonCode": reason_code,
            "rrn": rrn,
            "tansactionTime": txn_time,   # intentional typo — matches prod field name
            "toPocketType": None,
            "transactionAmount": amount,  # rupees, same as auth
            "transactionId": gen_transaction_id(),
            "transactionMode": 3,
            "transactionTime": txn_time,
            "transactionType": txn_type,
            "transferCardBalance": gen_transfer_balance(),
            "transferCardExpiry": "2030-07-09T00:00:00+05:30",
            "transferCardNumber": "7204430010000001",
            "upiTxnType": None,
        },
        "transactionUniqueId": txn_unique_id,
    }


# ── UPI ────────────────────────────────────────────────────────────────────────

def build_upi_auth(payee_vpa: str, amount: float, txn_unique_id: int, mcc: str = "0000",
                   card_number: str = "6204430026865829", reference_number: str | None = None) -> dict:
    """UPI authorization payload. amount in rupees.
    mcc='0000' → personal P2P (Volopay should block).
    mcc != '0000' → merchant P2M (Volopay should allow).
    """
    if str(mcc) == "0000":
        merchant_name, merchant_city = None, None
    else:
        merchant_name, merchant_city = gen_merchant()
    return {
        "accountDetails": None,
        "cardDetail": {
            "cardNumber": card_number,
            "expenseCategory": None,
            "expenseCategoryService": None,
            "externalAccountNumber": None,
            "externalCardIdentifier": None,
            "geoLocation": None,
            "maskedCardNumber": None,
            "referenceNumber": reference_number,
        },
        "merchantDetail": {
            "city": merchant_city,
            "mcc": str(mcc),
            "merchantName": merchant_name,
            "mid": None,
            "payeeVPA": payee_vpa,
            "tId": None,
        },
        "transactionDetail": {
            "batchId": gen_batch_id(),
            "feeType": None,
            "feeTypeName": None,
            "fromPocketType": None,
            "invoiceNumber": gen_upi_invoice(),
            "loadType": None,
            "rrn": None,
            "toPocketType": None,
            "transactionAmount": amount,
            "transactionId": gen_transaction_id(),
            "transactionMode": None,
            "transactionType": 2,
        },
        "transactionUniqueId": txn_unique_id,
    }


def build_upi_notification(
    payee_vpa: str,
    amount: float,
    txn_unique_id: int,
    notification_unique_id: int,
    txn_time: str,
    upi_txn_type: str = "P2P",
    mcc: str = "0000",
    txn_type: int = 2,
    reason_code: int = 0,
    message: str = "Transaction successful.",
) -> dict:
    """UPI notification payload. amount in rupees (same as auth — no conversion)."""
    embedded_rrn = gen_rrn()
    if str(mcc) == "0000":
        merchant_name, merchant_city = None, None
    else:
        merchant_name, merchant_city = gen_merchant()
    return {
        "accountDetails": None,
        "cardDetail": {
            "cardNumber": "6204430026865829",
            "expenseCategory": None,
            "expenseCategoryService": None,
            "externalAccountNumber": None,
            "externalCardIdentifier": None,
            "geoLocation": None,
            "maskedCardNumber": None,
            "referenceNumber": None,
        },
        "merchantDetail": {
            "city": merchant_city,
            "mcc": str(mcc),
            "merchantName": merchant_name,
            "mid": None,
            "payeeVPA": payee_vpa,
            "tId": None,
        },
        "notificationUniqueId": notification_unique_id,
        "transactionDetail": {
            "approvalCode": gen_approval_code(),
            "batchId": gen_batch_id(),
            "feeType": None,
            "feeTypeName": None,
            "fromPocketType": None,
            "invoiceNumber": gen_upi_invoice(),
            "loadType": None,
            "merchantName": "UPI Switch",
            "message": message,
            "notes": f"|RRNumber~{embedded_rrn}|",
            "reasonCode": reason_code,
            "rrn": None,
            "tansactionTime": txn_time,  # intentional typo — matches prod field name
            "toPocketType": None,
            "transactionAmount": amount,  # rupees, same as auth
            "transactionId": gen_transaction_id(),
            "transactionMode": None,
            "transactionTime": txn_time,
            "transactionType": txn_type,
            "transferCardBalance": gen_transfer_balance(),
            "transferCardExpiry": "2030-07-09T00:00:00+05:30",
            "transferCardNumber": "7204430010000001",
            "upiTxnType": upi_txn_type,
        },
        "transactionUniqueId": txn_unique_id,
    }


# Backwards-compat aliases (old engine.py imports used these names)
build_auth = build_card_auth
build_notification = build_card_notification
