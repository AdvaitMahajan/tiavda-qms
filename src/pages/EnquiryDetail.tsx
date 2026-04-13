import { useParams } from "react-router-dom";

export default function EnquiryDetail() {
  const { id } = useParams();
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-foreground">Enquiry Detail</h1>
      <p className="mt-2 font-mono text-sm text-muted">{id}</p>
    </div>
  );
}
