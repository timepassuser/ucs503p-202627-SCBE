import { useEffect, useState } from "react";

export function useResource(loader, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    Promise.resolve()
      .then(loader)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((err) => {
        if (active) setError(err.message || "Request failed");
      });
    return () => {
      active = false;
    };
  }, deps);

  return { data, error, setData, setError };
}
