import mongoose, { Document, Schema } from "mongoose";

export interface Medication {
  name: string;
  dose?: string;
  duration: string;
}

export interface Vitals {
  [key: string]: string | number | null;
}

export interface Visit {
  visit_date: Date;
  doctor_id: number;
  diagnosis?: string;
  medications?: Medication[];
  Vitals?: Vitals;
  notes?: string;
}

export interface MedicalHistory extends Document {
  patient_id: number;
  history: Visit[];
  createdDate: Date;
  updatedDate: Date;
}
const MedicationSchema = new Schema<Medication>({
  name: { type: String, required: true },
  dose: { type: String, required: true },
  duration: { type: String, required: true },
});
const VisitSchema = new Schema<Visit>({
  visit_date: { type: Date, default: Date.now },
  doctor_id: { type: Number, required: true },
  diagnosis: { type: String, required: true },
  medications: { type: [MedicationSchema], default: [] },
  Vitals: { type: Schema.Types.Mixed }, 
  notes: { type: String },
});
const HistorySchema = new Schema<MedicalHistory>(
  {
    patient_id: { type: Number, required: true, index: true }, 
    history: { type: [VisitSchema], default: [] },
  },
  { timestamps: true }
);

export const HistoryDB = mongoose.model<MedicalHistory>(
  "HistoryDB",
  HistorySchema
);
