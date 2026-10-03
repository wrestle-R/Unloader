import { createRoot } from "react-dom/client";
import { Dashboard } from "../../src/ui/Dashboard";
import "../../src/ui/dashboard.css";

const root = document.getElementById("root");
if (root) createRoot(root).render(<Dashboard />);
