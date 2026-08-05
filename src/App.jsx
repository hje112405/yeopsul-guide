import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

function App() {
  const [stores, setStores] = useState([]);

  useEffect(() => {
    async function getStores() {
      const { data, error } = await supabase
        .from("stores")
        .select("*");

      if (error) {
        console.error(error);
      } else {
        setStores(data);
      }
    }

    getStores();
  }, []);

  return (
    <div style={{ padding: "30px" }}>
      <h1>🍽 엽슐랭 가이드</h1>

      {stores.map((store) => (
        <div
          key={store.id}
          style={{
            border: "1px solid #ddd",
            padding: "15px",
            marginBottom: "15px",
            borderRadius: "10px",
          }}
        >
          <h2>{store.name}</h2>
          <p>⭐ {store.rating}</p>
          <p>{store.review}</p>
        </div>
      ))}
    </div>
  );
}

export default App;