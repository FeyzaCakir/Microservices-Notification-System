from fastapi import FastAPI,HTTPException
from pydantic import BaseModel,EmailStr
import grpc
import user_pb2,user_pb2_grpc
from dotenv import load_dotenv
import os 
import jwt
from datetime import datetime,timedelta

load_dotenv()

SECRET_KEY=os.getenv("SECRET_KEY")
ALGORITHM="HS256"


# gRPC'nin Docker DNS çözümlemesini bozmasını engellemek için yerel DNS'i zorunlu kılıyoruz
os.environ["GRPC_DNS_RESOLVER"] = "native"

app=FastAPI(title="Auth Service")

#Schemas
class RegisterSchema(BaseModel):
    name:str
    email:str
    password:str
    
class LoginSchema(BaseModel):
    email:str
    password:str


#Register
@app.post("/register")
async def register(user_data:RegisterSchema):
    try:
        #gRPC kanalını aç (Node.js UserService'e bağlan)
        channel = grpc.insecure_channel("user_service:50051")
        stub=user_pb2_grpc.UserServiceStub(channel)
        
        #gRPC isteği oluştur
        request=user_pb2.CreateUserRequest(
            name=user_data.name,
            email=user_data.email,
            password=user_data.password
        )
        
        #RPC çağrısı yap
        response=stub.CreateUser(request)
        
        #gRPC cevabını HTTP cevabı olarak döndür
        return {
            "success":response.success,
            "user_id":response.id,
            "email":response.email
        }
    
    except grpc.RpcError as e:
        # Eğer Node.js sunucusu kapalıysa veya hata fırlattıysa burası yakalar
        raise HTTPException(status_code=500,detail=f"grpc iletişim hatası: {e.details()}")
    
    
#Login
@app.post("/login")
async def login(user_data:LoginSchema):
    try:
        channel=grpc.insecure_channel("user_service:50051")
        stub=user_pb2_grpc.UserServiceStub(channel)
        
        request= user_pb2.LoginUserRequest(
            email=user_data.email,
            password=user_data.password
        )
        
        response=stub.LoginUser(request)
        
        if response.success:
            payload= {
                "user_id":response.id,
                "email":response.email,
                "name":response.name,
                "exp":datetime.utcnow()+timedelta(hours=1)
            }
        
            access_token=jwt.encode(payload,SECRET_KEY,algorithm=ALGORITHM)
            
            return {
                "access_token":access_token,
                "token_type":"bearer",
                "message":"Giriş Başarılı"
            }
        else:
            raise HTTPException(status_code=401,detail="Giriş başarısız")
        
        
     
     
    #hata kısmı    
    except grpc.RpcError as e:
        status_code=500
        
        if e.code()==grpc.StatusCode.NOT_FOUND:
            status_code=404
        elif e.code()==grpc.StatusCode.UNAUTHENTICATED:
            status_code=401
        
        raise HTTPException(status_code=status_code,detail=f"Giriş hatası {e.details()}")