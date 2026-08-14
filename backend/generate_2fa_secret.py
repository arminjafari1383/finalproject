import pyotp
import qrcode


secret = pyotp.random_base32()


print("ADMIN SECRET:")
print(secret)


uri = pyotp.TOTP(secret).provisioning_uri(
    name="admin@aipolify.com",
    issuer_name="AI POLIFY"
)


print("\nQR URI:")
print(uri)


img = qrcode.make(uri)

img.save("admin_google_auth.png")


print("\nQR created: admin_google_auth.png")