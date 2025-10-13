import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

const CommentSchema = new Schema(
  {
    task: { type: Types.ObjectId, ref: "Task", required: true, index: true },
    author: { type: Types.ObjectId, ref: "User", required: true, index: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    mentions: [{ type: Types.ObjectId, ref: "User" }],
//    attachments: [{ type: Types.ObjectId, ref: "Attachment" }],
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

CommentSchema.index({ task: 1, createdAt: -1 });
export default model("Comment", CommentSchema);
