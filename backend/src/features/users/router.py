"""User registration API."""

from fastapi import APIRouter, Depends, HTTPException, status
from pwdlib import PasswordHash
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.database import User, UserRole, get_db
from src.features.users.schemas import UserRegistration, UserResponse

router = APIRouter(prefix="/auth", tags=["authentication"])
password_hasher = PasswordHash.recommended()


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a guest account",
)
def register_user(
    registration: UserRegistration,
    db: Session = Depends(get_db),
) -> User:
    email = str(registration.email).lower()
    existing_user = db.scalar(select(User).where(func.lower(User.email) == email))
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(
        email=email,
        password_hash=password_hasher.hash(registration.password.get_secret_value()),
        role=UserRole.GUEST,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as error:
        # Handles two concurrent registrations for the same normalized email.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        ) from error

    db.refresh(user)
    return user
