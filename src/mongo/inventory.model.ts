import mongoose, { Schema, Document } from "mongoose";

interface Medicine {
  medicine_name: string;
  batch_no: string;
  expiry_date: Date;
  quantity: number;
  unit_price: number;
  category?: string;
  manufacturer?: string;
  last_restock?: Date;
}

export interface ChemistInventory extends Document {
  chemist_id: number;
  inventory: Medicine[];
  createdAt?: Date;
  updatedAt?: Date;
}

const MedicineSchema = new Schema<Medicine>({
  medicine_name: { type: String, required: true },
  batch_no: { type: String, required: true },
  expiry_date: { type: Date, required: true },
  quantity: { type: Number, required: true },
  unit_price: { type: Number, required: true },
  category: String,
  manufacturer: String,
  last_restock: Date,
});

const ChemistInventorySchema = new Schema<ChemistInventory>(
  {
    chemist_id: { type: Number, required: true, index: true },
    inventory: { type: [MedicineSchema], default: [] },
  },
  { timestamps: true }
);

export const ChemistInventoryDB = mongoose.model<ChemistInventory>(
  "ChemistInventory",
  ChemistInventorySchema
);
