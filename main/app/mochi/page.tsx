import { getReadmeConfig } from "@/lib/readme-config";
import { MochiClient } from "@/app/mochi/mochi-client";

export default function MochiPage() {
  const config = getReadmeConfig();
  return <MochiClient homepageName={config.homepageName} />;
}
