import os
from celery import Celery
import time

REDIS_URL=os.environ.get("REDIS_URL")
app = Celery('tasks', broker=REDIS_URL, backend=REDIS_URL)

@app.task(bind=True,retry_kwargs={'max_retries':3})
def send_welcome_email(self,user_data):
    
    try:
        name=user_data.get("name","Kullanıcı")
        email=user_data.get("email")
        
        print("[Notification Service] Kuyruktan yeni mesaj alındı!")
        print(f"Hoş geldin e-postası hazırlanıyor -> Alıcı: {name} ({email})")
        
        # Gerçek bir API isteğini simüle etmek için 2 saniye bekletiyoruz (Third-Party API süresi)
        time.sleep(2)

        if email=="hata@test.com":
            print("[Simülasyon] Mail sunucusuna bağlanılamadı!")
            raise Exception("Mail Sunucusu Yanıt Vermiyor (SMTP_TIMEOUT)")
        
        print(f"Başarılı: Hoş geldin maili {email} adresine başarıyla gönderildi!")
        return {"status":"sent","email":email}
    
    except Exception as exc:
        # Exponential Backoff mantığı: İlk hata 2sn, ikinci hata 4sn, üçüncü hata 8sn sonra dener
        retry_delay=2** self.request.retries
        print(f"[Retry] Mail gönderimi başarısız oldu. {retry_delay} saniye sonra tekrar denenecek... (Deneme No: {self.request.retries + 1}/3)")
         
        raise self.retry(exc=exc, countdown=retry_delay) 