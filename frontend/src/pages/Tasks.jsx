import { useEffect, useState } from "react";
import { getTasks } from "../services/api.js";
import TaskCard from "../components/ui/TaskCard.jsx";
import CreateTaskButton from "../components/ui/CreateTaskButton.jsx";

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load tasks from server
  const loadTasks = async () => {
    try {
      setLoading(true);
      const data = await getTasks();
      setTasks(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle task creation
  const handleTaskCreated = (newTask) => {
    setTasks(prevTasks => [newTask, ...prevTasks]);
  };

  // Handle task update
  const handleTaskUpdated = (updatedTask) => {
    setTasks(prevTasks => 
      prevTasks.map(task => 
        task._id === updatedTask._id ? updatedTask : task
      )
    );
  };

  // Handle task deletion
  const handleTaskDeleted = (deletedTaskId) => {
    setTasks(prevTasks => 
      prevTasks.filter(task => task._id !== deletedTaskId)
    );
  };

  useEffect(() => {
    loadTasks();
  }, []);

  if (loading) return <p>loading...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <>
      <CreateTaskButton onTaskCreated={handleTaskCreated}>
        Create Task
      </CreateTaskButton>
      <h1>Tasks Page</h1>
      {tasks.map((task) => (
        <TaskCard 
          key={task._id} 
          task={task} 
          onTaskUpdated={handleTaskUpdated}
          onTaskDeleted={handleTaskDeleted}
        />
      ))}
    </>
  );
}