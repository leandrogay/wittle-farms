import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

const CommentSchema = new Schema(
  {
    task: { type: Types.ObjectId, ref: "Task", required: true, index: true },
    author: { type: Types.ObjectId, ref: "User", required: true, index: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    mentions: [{ type: Types.ObjectId, ref: "User", index: true }],
//    attachments: [{ type: Types.ObjectId, ref: "Attachment" }],
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

CommentSchema.add({
  clientKey: { type: String, index: true },
});

CommentSchema.index(
  { clientKey: 1 },
  { unique: true, partialFilterExpression: { clientKey: { $type: "string" } } }
);

export default model("Comment", CommentSchema);
