import { useNavigate } from "react-router-dom";
import CreateProjectForm from "../components/ui/CreateProjectForm.jsx";

export default function CreateProject() {
  const navigate = useNavigate();

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <CreateProjectForm
        onCancel={() => navigate(-1)}
        onCreated={(p) => navigate(`/projects/${p._id || ""}`)}
      />
    </div>
  );
}
