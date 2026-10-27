const {Sequelize, DataTypes, Model}= require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL,{
    dialect: 'postgres',
    logging: false
});

class User extends Model {}
User.init({
    id: {
        type:DataTypes.INTEGER,
        autoIncrement:true,
        primaryKey:true
    },
    name:{
        type:DataTypes.STRING,
        allowNull:false,
        unique:true
    },
    password: {
        type:DataTypes.STRING,
        allowNull:false
    },
    email:{
        type:DataTypes.STRING,
        allowNull:false,
        unique:true,
        validate:{
            isEmail:true
        }
    }
},
{
    sequelize,  // Hangi veritabanı bağlantısını kullanacağını belirttik (ZORUNLU)
    modelName:'User'  // Tablo adı veritabanında 'Users' olarak otomatik oluşur
});
// Diğer dosyaların (server.js vb.) erişebilmesi için dışa aktarıyoruz
module.exports={sequelize,User}