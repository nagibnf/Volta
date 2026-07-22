import stations from "@/data/stations.json";
import vehicles from "@/data/vehicles.json";
import { VoltaApp } from "@/components/volta-app";

export default function Home() {
  return <VoltaApp stations={stations} vehicles={vehicles} />;
}
