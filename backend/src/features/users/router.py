"""User registration API."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.database import User, UserRole, get_db
from src.features.users.schemas import AccessToken, UserLogin, UserRegistration, UserResponse
from src.features.users.security import (
    create_access_token,
    get_current_user,
    password_hasher,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


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


@router.post(
    "/login",
    response_model=AccessToken,
    summary="Sign in and receive an access token",
)
def login_user(
    credentials: UserLogin,
    db: Session = Depends(get_db),
) -> AccessToken:
    email = str(credentials.email).lower()
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    password = credentials.password.get_secret_value()

    if user is None or not password_hasher.verify(password, user.password_hash) or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        token = create_access_token(user.id)
    except RuntimeError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured",
        ) from error

    return AccessToken(access_token=token)


@router.get("/me", response_model=UserResponse, summary="Get the signed-in user")
def get_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
