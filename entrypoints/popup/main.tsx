import { createRoot } from "react-dom/client";
import { Popup } from "../../src/ui/Popup";
import "../../src/ui/popup.css";

const root = document.getElementById("root");
if (root) createRoot(root).render(<Popup />);
