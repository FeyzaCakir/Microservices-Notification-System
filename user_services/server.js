const path= require("path"); // Bu kütüphane sayesinde gRPC sunucusu ve istemcisi oluşturabiliriz.
const grpc= require("@grpc/grpc-js");
const protoLoader= require("@grpc/proto-loader"); //.proto dosyalarını yüklemek için
const {sequelize,User}=require("./database");
const bcrypt= require("bcrypt");
const { timeStamp } = require("console");
const {Queue}= require("bullmq"); //Bullmq
const IORedis= require("ioredis"); //redis bağlantısı
 
//const PROTO_PATH=path.join(__dirname, '../protos/user.proto');
const PROTO_PATH = process.env.DATABASE_URL ? '/protos/user.proto' : path.join(__dirname, '../protos/user.proto');
const packageDefinition=protoLoader.loadSync(PROTO_PATH,{
    keepCase:true, //.proto dosyasındaki orijinal isimleri korur
    longs:String,
    enums:String,
    defaults:true,
    oneofs:true //Bu ayar sayesinde Node.js tarafında hangi alanın seçildiğini kolayca görebiliriz
}); //.proto dosyasını senkron şekilde yüklüyor ve bir tanım objesi oluşturuyoruz
const userProto= grpc.loadPackageDefinition(packageDefinition); //Yüklenen tanımı gRPC’ye aktarıyoruz

console.log("REDIS_URL =", process.env.REDIS_URL);
//redis bağlantısı sağlama
const connection= new IORedis(process.env.REDIS_URL); //docker.yaml dosyasındaki enviroment->url ile çağırma
//Queue nesneleri
const notificationQueue= new Queue("notification-queue",{connection});
const loggingQueue=new Queue("logging-queue",{connection});


//kullanıcı oluşturma
async function createUser(call,callback) {
    try {
        const {name,password,email}=call.request;

        //bcrypt
        const saltRounds=10;
        const hashedPassword= await bcrypt.hash(password,saltRounds);

        //save user to dbm
        const newUser= await User.create({
            name,
            email,
            password:hashedPassword
        });

        console.log(`Yeni kullanıcı veritabanına kaydedildi: ${email}`);

        //bullmq nesneleri ile kuyruğa iş ekleme 
        await notificationQueue.add("send_welcome_email",{email: newUser.email,name:newUser.name});
        console.log("Notification queue job oluşturuldu");
        await loggingQueue.add("user_registered_log",{message:`Yeni bir kullanıcı kaydoldu ${newUser.email}`,timeStamp:new Date() });
        console.log("Logging queue job oluşturuldu");

        
        //response
        callback(null,{
            success:true,   
            email:newUser.email,
            id:String(newUser.id)
        });

    } catch (error) {
        console.error("Kullanıcı kayıt hatası (Sequelize/Bcrypt):", error); 
        
        let errorMessage="Kullanıcı oluşturulurken bir hata oluştu";
        if (error.name=== "SequelizeUniqueConstraintError") {
            errorMessage= "Bu e-posta adresi zaten kullanımda!";
        }

        //response error
        callback({
            code:grpc.status.INTERNAL,
            detail:errorMessage
        });
    }
}
//bu dosyadan dışarıya hangi fonksiyon/nesne/özelliğin paylaşılacağını belirtir ve bu fonksiyonu dışarıya açar.
module.exports={createUser};

//kullanıcı giriş
async function loginUser(call,callback) {
    try {
        const {email,password}=call.request;
        const user= await User.findOne({where:{email}});
        
        //kullanıcı yoksa grpc hatası döner
        if (!user) {
            return callback({
                code:grpc.status.NOT_FOUND,
                details:"User not found"
            });
        }

        const isMatch= await bcrypt.compare(password,user.password);

        //şifre yanlış olma durumu
        if (!isMatch) {
            return callback({
                code:grpc.status.UNAUTHENTICATED,
                details:"Invalid credentials"
            });
        }

        //eğer şifre doğruysa
        return callback(null,{
            success:true,
            id:user.id,
            email:user.email,
            name:user.name
        });

        
    } catch (error) {
        console.error("Login Error",error);
        return callback({
            code:grpc.status.INTERNAL,
            details:"Server error during login"
        });
    }
}

const server=new grpc.Server(); 

server.addService(userProto.UserService.service,{
    CreateUser: createUser,
    LoginUser:loginUser
});
server.bindAsync("0.0.0.0:50051",grpc.ServerCredentials.createInsecure(),async (err,port)=> {
    if (err) {
        console.error("gRPC Server başlatma hatası:",err);
        return;
    }
    try{
        await sequelize.sync(); //user tablosu dbde otomatik oluşur 
        console.log("Database synced. Users table is ready.");
        console.log(`gRPC Server running on port: ${port}`);
    }
    catch (err) {
    console.error("Database sync failed:",err);
    }
});

