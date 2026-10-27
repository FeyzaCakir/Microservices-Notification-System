const {Worker}= require("bullmq");

// Çakışma olmaması için logging verilerini Redis'in 1 numaralı DB'sinde tutuyoruz
const REDIS_URL = process.env.REDIS_URL || "redis://redis-broker:6379/0";
console.log("REDIS_URL =", REDIS_URL);
console.log("[Logging Service] Başlatıldı. Kuyruk dinleniyor...");

const loggingWorker=new Worker(
    "logging-queue",
    async(job)=> {
        
        // Kuyruğa yeni bir log mesajı düştüğünde burası tetiklenir
        const {message,timeStamp}=job.data;
        console.log("-----------------------------------------");
        printCenteralizedLog(job.name,message,timeStamp);
        console.log("-----------------------------------------");
    },
    {
        connection:{url:REDIS_URL}
    }
);

//kuyruğa gelen log bilgilerini düzenli ve okunabilir bir şekilde ekrana yazdırmak için fonksiyon
function printCenteralizedLog(eventName,message,timeStamp) {
    //eğer timestamp varsa (?) gönderilen zamanı kullan yoksa (:) şu anki zamanı kullan, toLocaleString()=zamanı okunabilir hale çevirme
    const date= timeStamp ? new Date(timeStamp).toLocaleString() : new Date().toLocaleString(); 
    console.log(`[MERKEZİ LOG SERVİSİ] | Olay: ${eventName}`);
    console.log(`Zaman: ${date}`);
    console.log(`Mesaj: ${message}`);
}

// Worker hata aldığında uygulamanın çökmemesi için dinleyici ekleme
//Görev hatalarını yakalar
loggingWorker.on('failed', (job,err)=> {
    console.log(`Log işlenirken hata oluştu (Job ID: ${job?.id}):`,err.message);
});

//Altyapı ve Redis bağlantı hatalarını yakalar
loggingWorker.on('error',(err)=>{
    console.log(`Redis veya Worker bağlantı hatası:`,err.message);
});