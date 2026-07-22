import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { RATE_KEYS } from "@/lib/quotationEngine";
import { collectBoqRateKeys } from "@/lib/templateRegistry";
import { DEFAULT_TEMPLATES } from "@/lib/templateDefaults";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type City = { id: string; city: string; state: string | null; sort_order: number };
type Row = {
  id: string; label: string; rate_key: string | null; basis: string;
  unit: string | null; applies_to: string; sort_order: number;
};
type Cell = { id: string; row_id: string; city_id: string; value: number | null };

const BASIS_OPTIONS = [
  { value: "lump_sum", label: "Lump sum (per project)" },
  { value: "per_bore", label: "Per bore" },
  { value: "soil_meters", label: "Per metre — soil" },
  { value: "rock_meters", label: "Per metre — rock" },
  { value: "per_metre_total", label: "Per metre — total depth" },
];

const ALL_RATE_KEYS = [...RATE_KEYS, ...collectBoqRateKeys(DEFAULT_TEMPLATES)];

export function RateMatrixGrid() {
  const qc = useQueryClient();
  const [showAddCity, setShowAddCity] = useState(false);
  const [showAddRow, setShowAddRow] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["city-rates"],
    queryFn: () => apiClient.get<{ cities: City[]; rows: Row[]; cells: Cell[] }>("/city-rates"),
  });

  const cities = data?.cities ?? [];
  const rows = data?.rows ?? [];
  const cellFor = (rowId: string, cityId: string) =>
    data?.cells.find((c) => c.row_id === rowId && c.city_id === cityId)?.value ?? null;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["city-rates"] });

  const saveCell = useMutation({
    mutationFn: (v: { row_id: string; city_id: string; value: number | null }) => apiClient.put("/city-rates/cells", v),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message),
  });

  // ── add city ──
  const [cityName, setCityName] = useState("");
  const [cityState, setCityState] = useState("");
  const addCity = useMutation({
    mutationFn: () => apiClient.post("/city-rates/cities", { city: cityName.trim(), state: cityState.trim() || null, sort_order: cities.length + 1 }),
    onSuccess: () => { toast.success("City added"); invalidate(); setShowAddCity(false); setCityName(""); setCityState(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const delCity = useMutation({
    mutationFn: (id: string) => apiClient.del(`/city-rates/cities/${id}`),
    onSuccess: () => { toast.success("City removed"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  // ── add row ──
  const [rowLabel, setRowLabel] = useState("");
  const [rowKey, setRowKey] = useState<string>("__custom__");
  const [rowBasis, setRowBasis] = useState("lump_sum");
  const [rowUnit, setRowUnit] = useState("");
  const addRow = useMutation({
    mutationFn: () =>
      apiClient.post("/city-rates/rows", {
        label: rowLabel.trim(),
        rate_key: rowKey === "__custom__" ? null : rowKey,
        basis: rowBasis,
        unit: rowUnit.trim() || null,
        sort_order: rows.length + 1,
      }),
    onSuccess: () => { toast.success("Activity added"); invalidate(); setShowAddRow(false); setRowLabel(""); setRowKey("__custom__"); setRowBasis("lump_sum"); setRowUnit(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const delRow = useMutation({
    mutationFn: (id: string) => apiClient.del(`/city-rates/rows/${id}`),
    onSuccess: () => { toast.success("Activity removed"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const patchRow = useMutation({
    mutationFn: (v: { id: string; basis?: string; label?: string }) => apiClient.patch(`/city-rates/rows/${v.id}`, v),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="h-40 rounded-xl animate-pulse" style={{ background: "#E0E7EF" }} />;

  return (
    <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E0E7EF", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", padding: "20px 24px" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "16px", color: "#0A1929", margin: 0 }}>
            City Rate Matrix
          </h3>
          <p style={{ fontSize: "13px", color: "#546E7A", margin: "2px 0 0" }}>
            Rates per city. Used automatically when a quotation is built for that city.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAddRow(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Add Activity</Button>
          <Button size="sm" className="text-white" style={{ background: "#1565C0" }} onClick={() => setShowAddCity(true)}>
            <MapPin className="h-3.5 w-3.5 mr-1" /> Add City
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg p-2.5 mb-4" style={{ background: "#EBF2FF", border: "1px solid #BFDBFE" }}>
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#1565C0" }} />
        <p className="text-[12px]" style={{ color: "#1E40AF", margin: 0 }}>
          A blank cell means <strong>not configured (TBD)</strong> — that activity will come through as ₹0 on a quotation for
          that city and must be priced manually. <strong>Basis</strong> controls how the quantity is calculated
          (e.g. Mobilisation as a flat lump sum vs per bore).
        </p>
      </div>

      {cities.length === 0 || rows.length === 0 ? (
        <div className="text-center py-10 text-sm" style={{ color: "#94A3B8" }}>
          {cities.length === 0 ? "Add a city to start building the matrix." : "Add an activity to start building the matrix."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #E0E7EF" }}>
                <th style={{ textAlign: "left", padding: "8px 10px", color: "#546E7A", minWidth: "200px" }}>Activity</th>
                <th style={{ textAlign: "left", padding: "8px 10px", color: "#546E7A", minWidth: "170px" }}>Basis</th>
                {cities.map((c) => (
                  <th key={c.id} style={{ textAlign: "right", padding: "8px 10px", color: "#0A1929", whiteSpace: "nowrap" }}>
                    <div className="flex items-center justify-end gap-1.5">
                      <span>
                        {c.city}
                        {c.state && <span style={{ display: "block", fontSize: "11px", fontWeight: 400, color: "#94A3B8" }}>{c.state}</span>}
                      </span>
                      <button
                        title={`Remove ${c.city}`}
                        onClick={() => { if (confirm(`Remove ${c.city} and its rates?`)) delCity.mutate(c.id); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#CBD5E1" }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </th>
                ))}
                <th style={{ width: "36px" }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #F0F4F8" }}>
                  <td style={{ padding: "8px 10px" }}>
                    <div style={{ fontWeight: 600, color: "#0A1929" }}>{r.label}</div>
                    <div style={{ fontSize: "11px", color: "#94A3B8" }}>
                      {r.rate_key ? <span className="font-mono">{r.rate_key}</span> : <em>custom line item</em>}
                    </div>
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <Select value={r.basis} onValueChange={(v) => patchRow.mutate({ id: r.id, basis: v })}>
                      <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BASIS_OPTIONS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  {cities.map((c) => {
                    const v = cellFor(r.id, c.id);
                    return (
                      <td key={c.id} style={{ padding: "6px 8px", textAlign: "right" }}>
                        <input
                          type="number"
                          defaultValue={v ?? ""}
                          placeholder="TBD"
                          onBlur={(e) => {
                            const raw = e.target.value.trim();
                            const next = raw === "" ? null : Number(raw);
                            if (next !== v) saveCell.mutate({ row_id: r.id, city_id: c.id, value: next });
                          }}
                          style={{
                            width: "100px", textAlign: "right", padding: "6px 8px",
                            border: `1px solid ${v === null ? "#FCD34D" : "#E0E7EF"}`,
                            background: v === null ? "#FFFBEB" : "white",
                            borderRadius: "8px", fontSize: "13px",
                          }}
                        />
                      </td>
                    );
                  })}
                  <td style={{ textAlign: "center" }}>
                    <button
                      title={`Remove ${r.label}`}
                      onClick={() => { if (confirm(`Remove "${r.label}"?`)) delRow.mutate(r.id); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#CBD5E1" }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add City */}
      <Dialog open={showAddCity} onOpenChange={setShowAddCity}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add City</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>City *</Label><Input value={cityName} onChange={(e) => setCityName(e.target.value)} placeholder="Alibaug" /></div>
            <div>
              <Label>State (optional)</Label>
              <Input value={cityState} onChange={(e) => setCityState(e.target.value)} placeholder="Maharashtra" />
              <p className="text-[11px] mt-1" style={{ color: "#94A3B8" }}>
                Used as a fallback: an enquiry in an unlisted city of this state will use this city's rates.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCity(false)}>Cancel</Button>
            <Button disabled={!cityName.trim() || addCity.isPending} onClick={() => addCity.mutate()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Activity (row) */}
      <Dialog open={showAddRow} onOpenChange={setShowAddRow}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Activity</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Label *</Label><Input value={rowLabel} onChange={(e) => setRowLabel(e.target.value)} placeholder="Mobilisation" /></div>
            <div>
              <Label>Linked rate</Label>
              <Select value={rowKey} onValueChange={setRowKey}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[240px]">
                  <SelectItem value="__custom__">Custom line item (not linked)</SelectItem>
                  {ALL_RATE_KEYS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] mt-1" style={{ color: "#94A3B8" }}>
                Linking to an existing rate overrides that rate for the city. A custom item is added as an extra line on the quotation.
              </p>
            </div>
            <div>
              <Label>Basis</Label>
              <Select value={rowBasis} onValueChange={setRowBasis}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BASIS_OPTIONS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Unit (display)</Label><Input value={rowUnit} onChange={(e) => setRowUnit(e.target.value)} placeholder="LS / RM / Nos" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRow(false)}>Cancel</Button>
            <Button disabled={!rowLabel.trim() || addRow.isPending} onClick={() => addRow.mutate()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
