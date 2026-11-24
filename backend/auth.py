"""User accounts kept in data/users.json.

As required by the spec, passwords (and security answers) are stored Base64
encoded. NOTE: Base64 is an *encoding*, not encryption - anyone who can read
users.json can recover every password. Swap encode_secret/check_secret for a
real password hash (e.g. werkzeug.security.generate_password_hash) before any
production use.
"""
import base64
import hmac
import re
from datetime import datetime, timezone

from storage import JsonStore

users = JsonStore("users.json")

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
MIN_PASSWORD = 6


class AuthError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def encode_secret(value: str) -> str:
    return base64.b64encode(value.encode("utf-8")).decode("ascii")


def check_secret(value: str, encoded: str) -> bool:
    return hmac.compare_digest(encode_secret(value), encoded or "")


def _norm_answer(answer: str) -> str:
    return " ".join((answer or "").strip().lower().split())


def _key(username: str) -> str:
    return (username or "").strip().lower()


def _validate_password(password: str):
    if not password or len(password) < MIN_PASSWORD:
        raise AuthError(f"Password must be at least {MIN_PASSWORD} characters.")


def signup(username: str, password: str, question: str, answer: str) -> str:
    username = (username or "").strip()
    if not USERNAME_RE.match(username):
        raise AuthError("Username must be 3-32 characters: letters, digits, _ . -")
    _validate_password(password)
    question = (question or "").strip()
    if len(question) < 5:
        raise AuthError("Please provide a security question.")
    if not _norm_answer(answer):
        raise AuthError("Please provide an answer to your security question.")

    def _add(data):
        if _key(username) in data:
            raise AuthError("That username is already taken.", 409)
        data[_key(username)] = {
            "username": username,
            "password": encode_secret(password),
            "question": question,
            "answer": encode_secret(_norm_answer(answer)),
            "created": datetime.now(timezone.utc).isoformat(),
        }

    users.update(_add)
    return username


def login(username: str, password: str) -> str:
    user = users.load().get(_key(username))
    if not user or not check_secret(password or "", user["password"]):
        raise AuthError("Invalid username or password.", 401)
    return user["username"]


def get_question(username: str) -> str:
    user = users.load().get(_key(username))
    if not user:
        raise AuthError("No account with that username.", 404)
    return user["question"]


def reset_password(username: str, answer: str, new_password: str) -> str:
    _validate_password(new_password)

    def _reset(data):
        user = data.get(_key(username))
        if not user:
            raise AuthError("No account with that username.", 404)
        if not check_secret(_norm_answer(answer), user["answer"]):
            raise AuthError("That answer is not correct.", 403)
        user["password"] = encode_secret(new_password)
        return user["username"]

    return users.update(_reset)


def exists(username: str) -> bool:
    return _key(username) in users.load()
