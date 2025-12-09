import express from "express";
import dotenv from "dotenv";
import { pgConnection } from "./config/postgress.js";
import { mongoConnection } from "./config/mongo.js";
import { asha } from "./routes/asha.routes.js";
import { doctor } from "./routes/doctor.routes.js";
import cors from "cors";
import { patient } from "./routes/patient.routes.js";
import { router } from "./routes/surveyv1.routes.js";
import lhv from "./routes/lhv.model.js";
import noti from "./routes/notice.routes.js";



dotenv.config();
const app = express();
app.use(express.json());
app.use(cors())


if (!process.env.PORT) {
  console.log("PORT not found as enviornment variable");
  process.exit(1);
}
const PORT = Number(process.env.PORT) || 3000;

async function DBConnection() {
  await pgConnection();
  await mongoConnection();
}

DBConnection();

app.use("/api/v1/asha", asha);
app.use("/api/v1/doctor", doctor);
app.use("/api/v1/patient", patient);
app.use("/api/v1/survey",router);
app.use('/api/v1/lhv', lhv);
app.use('/api/v1/notice', noti);
app.use('api/v1/query', router);
app.use('/api/v1/appointment', router);

app.get('/',(req,res)=>{
  res.send("whatsup")
})
app
  .listen(PORT,"0.0.0.0", () => {
    console.log(`server has started ${PORT}`);
  })
  .on("error", (err) => {
    console.error("failed to start", err);
  });

