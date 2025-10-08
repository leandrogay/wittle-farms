import { useTheme } from "../../context/ThemeContext.jsx";

export default function AnimatedBackground({ children }) {
  const { theme } = useTheme();

  return (
    <div className="relative min-h-screen overflow-hidden text-gray-900 dark:text-gray-100 transition-colors duration-500">
      <div
        className={`absolute inset-0 -z-20 animate-gradient bg-gradient-to-br 
        ${theme === "light"
          ? "from-blue-100 via-indigo-200 to-purple-100"
          : "from-blue-800 via-indigo-900 to-purple-800"} 
        opacity-90 transition-all duration-700`}
      ></div>

      <div className="absolute inset-0 -z-10 bg-[url('/noise.svg')] opacity-15 mix-blend-overlay"></div>

      <div className="relative z-10">{children}</div>
    </div>
  );
}
