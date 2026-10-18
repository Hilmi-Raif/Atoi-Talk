import { queryClient } from "@/lib/query-client";
import { registerServiceWorker } from "@/lib/register-service-worker";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
