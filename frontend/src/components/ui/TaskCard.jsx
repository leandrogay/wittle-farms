import dayjs from "dayjs";

export default function TaskCard({ task }) {
  return (
    <div className="shadow-md rounded-xl border m-5 p-5">
      <p className="text-gray-400">
        Project: {task.assignedProject?.name ?? "—"}
      </p>

      <h2 className="text-xl font-bold text-gray-800">Title: {task.title}</h2>
      <p>Description: {task.description ?? "—"}</p>
      <p>Notes: {task.notes ?? "—"}</p>

      <div className="flex flex-wrap gap-2 mt-3 items-center bg-green-100">
        <span className="px-3 py-1 rounded-full font-semibold">
          {task.priority ?? "No priority"}
        </span>
        {task.deadline && (
          <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">
            Deadline: {dayjs(task.deadline).format("dddd, MMMM D, YYYY h:mm A")}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-3 items-center bg-blue-100">
        <span>Team Members: </span>
        <ul>
          {(task.assignedTeamMembers ?? []).map((tm) => (
            <li key={tm?._id}>{tm?.name ?? "Unknown"}</li>
          ))}
        </ul>
      </div>

      <div>
        {task.updatedAt && (
          <p>
            Updated at:{" "}
            {dayjs(task.updatedAt).format("dddd, MMMM D, YYYY h:mm A")}
          </p>
        )}
        {task.createdAt && (
          <p>
            Created at:{" "}
            {dayjs(task.createdAt).format("dddd, MMMM D, YYYY h:mm A")}
          </p>
        )}
        <p>Created by: {task.createdBy?.name ?? "—"}</p>
      </div>
    </div>
  );
}
