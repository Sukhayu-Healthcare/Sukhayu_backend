import express, { type Request, type Response } from "express";
import { getPgClinent } from "../config/postgress.js";
import * as argon2 from 'argon2'

export const asha = express.Router();


asha.get("/login", async (req: Request, res: Response) => {
    try {
        const { ashaId, password } = req.body;
        if(!ashaId || !password){
            res.status(400).json({
                message : "Please send ID and Password both"
            })
        }
        const pg = getPgClinent()
        const result = await pg.query(`SELECT * FROM asha_workers WHERE asha_ID = $1`,[ashaId]);
        if(result.rows.length == 0 ){
            res.status(404).json({
                message : "Asha Worker not found"
            })
            return
        }
        const asha = result.rows[0];
        const compare = await argon2.verify(password,asha.asha_password)
        if(compare){
            res.status(404).json({
                message:"Invalid Credentials"
            })
        }
    } catch (error) {
        
    }
  
  
});
