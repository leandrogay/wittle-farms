export default function TaskCard({ task }) {
  return (
    <div className="shadow-md rounded-xl border m-5 p-5">
      <h2 className="text-xl font-bold text-gray-800">Title: {task.title}</h2>
      <p>Description: {task.description}</p>
      <div className="flex flex-wrap gap-2 mt-3 items-center">
        <span className={`px-3 py-1 rounded-full font-semibold`}>
          {task.priority}
        </span>
        <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">
          Deadline: {task.deadline}
        </span>
      </div>
    </div>
  );
}
