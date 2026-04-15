import os
from functools import lru_cache

import boto3


class S3ConfigError(RuntimeError):
    pass


def _required_env(name: str) -> str:
    value = str(os.getenv(name, "") or "").strip()
    if not value:
        raise S3ConfigError(f"Variavel obrigatoria ausente para S3: {name}")
    return value


@lru_cache(maxsize=1)
def get_s3_client():
    region = _required_env("AWS_REGION")
    access_key_id = _required_env("AWS_ACCESS_KEY_ID")
    secret_access_key = _required_env("AWS_SECRET_ACCESS_KEY")
    return boto3.client(
        "s3",
        region_name=region,
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
    )


def get_default_bucket() -> str:
    return _required_env("AWS_S3_BUCKET")


def download_s3_object_bytes(key: str, bucket: str | None = None) -> bytes:
    resolved_bucket = str(bucket or get_default_bucket()).strip()
    if not resolved_bucket:
        raise S3ConfigError("Bucket S3 nao informado para download.")

    response = get_s3_client().get_object(Bucket=resolved_bucket, Key=key)
    body = response.get("Body")
    if body is None:
        raise RuntimeError("Arquivo nao encontrado no S3.")
    return body.read()
