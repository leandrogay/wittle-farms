import mongoose from "mongoose"
const { Schema, model, Types } = mongoose

const AttachmentSchema = new Schema(
  {
    task: { type: Types.ObjectId, ref: "Task", required: true, index: true },
    filename: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true }, // raw file content (<16MB)
    uploadedBy: { type: Types.ObjectId, ref: "User", required: true },
    uploadedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
)

export default model("Attachment", AttachmentSchema)
