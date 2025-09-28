import { useEffect, useState } from "react";
import { getTasks } from "../services/api.js";

import MiniTaskCard from "../components/ui/MiniTaskCard.jsx";
import TaskCard from "../components/ui/TaskCard.jsx";
import CreateTaskButton from "../components/ui/CreateTaskButton.jsx";
// import TaskButton from "../components/ui/TaskButton.jsx";

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadTask() {
      try {
        const data = await getTasks();
        setTasks(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadTask();
  }, []);

  if (loading) return <p>loading...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <>
      <CreateTaskButton>Create Task</CreateTaskButton>
      <h1>Tasks Page</h1>
      {tasks.map((task) => (
        <TaskCard key={task._id} task={task} />
      ))}
    </>
  );
}
