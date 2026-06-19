import { type TemplateDefinition, TEMPLATE_IDS } from "./templateRegistry";

export const BOQ_TYPE_1: TemplateDefinition = {
  id: TEMPLATE_IDS.BOQ_TYPE_1,
  name: "BOQ Type 1",
  description: "Standard SI BOQ — field works, detailed lab tests, report",
  sections: [
    {
      key: "A",
      label: "FIELD WORKS",
      items: [
        { description: "Mobilization of all drilling equipments, accessories, personnel, demobilization", unit: "RIGS", defaultQty: 1, defaultRate: 25000, rateKey: "boq_mobilisation" },
        { description: "Setting and shifting of rig at borehole locations", unit: "Nos.", defaultRate: 3000, rateKey: "boq_rig_setting", qtyDriver: "per_bore" },
        { description: "Boring minimum 100mm diameter hole in all types of soil strata", unit: "RMT", defaultRate: 700, rateKey: "boq_boring_soil_per_m", qtyDriver: "soil_meters" },
        { description: "Drilling Nx size exploratory bore holes in weathered rock / rock & collecting core samples", unit: "RMT", defaultRate: 1600, rateKey: "boq_boring_rock_per_m", qtyDriver: "rock_meters" },
        { description: "Conducting Standard Penetration Tests (SPT-N value) at regular intervals", unit: "Nos.", defaultRate: 250, rateKey: "boq_spt_per_test", qtyDriver: "spt" },
        { description: "Collecting undisturbed samples from boreholes using thin walled sampling tube", unit: "Nos.", defaultRate: 500, rateKey: "boq_uds_per_sample", qtyDriver: "uds" },
        { description: "Collecting groundwater samples for chemical analysis", unit: "Nos.", defaultRate: 300, rateKey: "boq_water_sample_collection", qtyDriver: "per_bore" },
        { description: "Preservation of soil and rock samples in core boxes", unit: "Nos.", defaultRate: 500, rateKey: "boq_core_boxes", qtyDriver: "per_bore" },
        { description: "Supply of water tanker for drilling purpose", unit: "Nos.", defaultRate: 2500, rateKey: "boq_water_tanker", qtyDriver: "per_bore" },
      ],
    },
    {
      key: "B",
      label: "LABORATORY TESTS",
      items: [
        { description: "Grain Size Analysis by mechanical sieve and hydrometer analysis", unit: "Nos.", subsection: "Soil Samples", defaultRate: 800, rateKey: "boq_lab_grain_size" },
        { description: "Liquid Limit and Plastic Limit (Atterberg Limits)", unit: "Nos.", subsection: "Soil Samples", defaultRate: 600, rateKey: "boq_lab_atterberg" },
        { description: "Unit weight and Specific Gravity of soil", unit: "Nos.", subsection: "Soil Samples", defaultRate: 500, rateKey: "boq_lab_unit_weight_sg" },
        { description: "Triaxial Shear Tests (Undrained) on undisturbed sample", unit: "Nos.", subsection: "Soil Samples", defaultRate: 2500, rateKey: "boq_lab_triaxial_uu" },
        { description: "Chemical analysis — pH, Sulphates, Chlorides in soil", unit: "Nos.", subsection: "Soil Samples", defaultRate: 1500, rateKey: "boq_lab_chemical_soil" },
        { description: "Natural Moisture Content (NMC) of soil by oven drying method", unit: "Nos.", subsection: "Soil Samples", defaultRate: 300, rateKey: "boq_lab_nmc" },
        { description: "Consolidation test on undisturbed sample", unit: "Nos.", subsection: "Soil Samples", defaultRate: 3000, rateKey: "boq_lab_consolidation" },
        { description: "Direct shear test (if sand is met)", unit: "Nos.", subsection: "Soil Samples", defaultRate: 2000, rateKey: "boq_lab_direct_shear" },

        { description: "Dry Density of rock samples", unit: "Nos.", subsection: "Rock Samples", defaultRate: 500, rateKey: "boq_lab_rock_density" },
        { description: "Water Absorption of rock", unit: "Nos.", subsection: "Rock Samples", defaultRate: 500, rateKey: "boq_lab_rock_water_absorption" },
        { description: "Porosity of rock", unit: "Nos.", subsection: "Rock Samples", defaultRate: 500, rateKey: "boq_lab_rock_porosity" },
        { description: "Specific Gravity of rock", unit: "Nos.", subsection: "Rock Samples", defaultRate: 500, rateKey: "boq_lab_rock_sg" },
        { description: "Unconfined Compressive Strength / Point Load Index of rock", unit: "Nos.", subsection: "Rock Samples", defaultRate: 2000, rateKey: "boq_lab_rock_ucs" },
        { description: "Modulus of Elasticity (E-value) test on rock", unit: "Nos.", subsection: "Rock Samples", defaultRate: 2500, rateKey: "boq_lab_rock_elasticity" },
        { description: "Poisson's Ratio of rock (compulsory for highrise approval)", unit: "Nos.", subsection: "Rock Samples", defaultRate: 2500, rateKey: "boq_lab_rock_poisson" },
        { description: "Triaxial Compression of rock (compulsory for highrise approval)", unit: "Nos.", subsection: "Rock Samples", defaultRate: 3000, rateKey: "boq_lab_rock_triaxial" },

        { description: "Determination of pH, Sulphates, and Chlorides in water samples", unit: "Nos.", subsection: "Water Samples", defaultRate: 1500, rateKey: "boq_lab_chemical_water" },
      ],
    },
    {
      key: "C",
      label: "GEOTECHNICAL REPORT",
      items: [
        {
          description:
            "Providing geotechnical report with all borehole logs, field test results, laboratory results, graphs, recommendations for foundation options, excavation side slopes, shoring, groundwater levels and addressing all geotechnical issues",
          unit: "LS",
          defaultQty: 1,
          defaultRate: 15000,
          rateKey: "boq_geotechnical_report",
        },
      ],
    },
    {
      key: "D",
      label: "LABOUR ACCOMMODATION",
      items: [
        { description: "Labour Accommodation and Transportation (if space not available on site)", unit: "LS", defaultQty: 1, defaultRate: 5000, rateKey: "boq_labour_accommodation" },
      ],
    },
  ],
  layout: {
    title: "BILL OF QUANTITIES FOR SOIL INVESTIGATION",
    hasRemarks: false,
    hasSummaryPage: false,
    hasCompanyInfo: false,
    hasProjectHeader: false,
    taxDisplay: "split_cgst_sgst",
    showPaymentTermsOnPdf: false,
    showBankingOnPdf: false,
  },
  defaultNotes: [
    "If structure height exceeds 120m, HRC norms compliance is required with minimum 50m borehole depth.",
    "Work will commence within 3-4 days after approval, work order, advance payment, and site clearance.",
    "Clear access to borehole location to be provided by client.",
    "Reduced Levels of Borehole point to be provided by client before completion of field work.",
    "Permission from authorities to work in project area shall be taken by client.",
  ],
  defaultPaymentTerms: "",
};

export const BOQ_TYPE_2: TemplateDefinition = {
  id: TEMPLATE_IDS.BOQ_TYPE_2,
  name: "BOQ Type 2",
  description: "Foundation Pile BOQ — topography survey + SI with remarks",
  sections: [
    {
      key: "a",
      label: "TOPOGRAPHY SURVEY & SOIL INVESTIGATION SURVEY BOQ",
      items: [
        { description: "Mobilisation of Drilling equipment, instrument, plant, instruments etc.", unit: "LS", defaultQty: 1, defaultRate: 25000, rateKey: "boq_mobilisation" },
        { description: "Establishment of temporary benchmarks", unit: "LS", defaultQty: 1, defaultRate: 5000, rateKey: "boq_temp_benchmark" },
        { description: "Detailed topographic survey with 0.5m contours", unit: "Sqm", defaultQty: 40000, defaultRate: 3, rateKey: "boq_topographic_survey" },
        { description: "Survey of existing features & utilities", unit: "LS", defaultQty: 1, defaultRate: 10000, rateKey: "boq_utility_survey" },
        { description: "Preparation of CAD drawings", unit: "LS", defaultQty: 1, defaultRate: 8000, rateKey: "boq_cad_drawings" },
        { description: "Setting & Shifting of rig at each bore hole location", unit: "Nos", defaultRate: 3000, rateKey: "boq_rig_setting", qtyDriver: "per_bore" },
        { description: "Drilling exploratory bore holes of 100mm diameter in all soil types", unit: "RM", defaultRate: 700, rateKey: "boq_boring_soil_per_m", qtyDriver: "soil_meters" },
        { description: "Drilling Nx size exploratory bore holes in weathered rock/rock & collecting samples (CR>10%)", unit: "RM", defaultRate: 1600, rateKey: "boq_boring_rock_per_m", qtyDriver: "rock_meters" },
        { description: "Conducting Standard Penetration Test (SPT)", unit: "Nos", defaultRate: 250, rateKey: "boq_spt_per_test", qtyDriver: "spt" },
        { description: "Collecting undisturbed soil samples (UDS) with thin walled sampling tube", unit: "Nos", defaultRate: 500, rateKey: "boq_uds_per_sample", qtyDriver: "uds" },
        { description: "Collection of ground water samples for chemical analysis", unit: "Nos", defaultRate: 300, rateKey: "boq_water_sample_collection", qtyDriver: "per_bore" },
        { description: "Collection of soil samples for chemical analysis", unit: "Nos", defaultRate: 300, rateKey: "boq_soil_sample_collection", qtyDriver: "per_bore" },
        { description: "Providing GI Core Boxes to preserve samples", unit: "Nos", defaultRate: 500, rateKey: "boq_core_boxes", qtyDriver: "per_bore" },
        { description: "Supply of water tankers for drilling purpose", unit: "Nos", defaultRate: 2500, rateKey: "boq_water_tanker", qtyDriver: "per_bore" },
        { description: "Refilling of bore holes and surface restoration", unit: "LS", defaultQty: 1, defaultRate: 5000, rateKey: "boq_bore_refilling" },
      ],
    },
    {
      key: "b",
      label: "LABORATORY TESTS",
      items: [
        { description: "Natural moisture content (NMC) of soils by oven drying method on UDS & block samples", unit: "Nos", is_qro: true, defaultRate: 300, rateKey: "boq_lab_nmc" },
        { description: "Liquid Limit (LL)", unit: "Nos", subsection: "Atterberg Limits of Soil", defaultRate: 400, rateKey: "boq_lab_ll" },
        { description: "Plastic Limit (PL)", unit: "Nos", subsection: "Atterberg Limits of Soil", defaultRate: 400, rateKey: "boq_lab_pl" },
        { description: "Shrinkage Limit (SL)", unit: "Nos", subsection: "Atterberg Limits of Soil", defaultRate: 400, rateKey: "boq_lab_sl" },
        { description: "Grain size analysis (GSA) by mechanical sieve & hydrometer analysis", unit: "Nos", defaultRate: 800, rateKey: "boq_lab_grain_size" },
        { description: "In situ dry density of soil samples from UDS and block samples", unit: "Nos", defaultRate: 500, rateKey: "boq_lab_in_situ_density" },
        { description: "Specific gravity of soil", unit: "Nos", defaultRate: 500, rateKey: "boq_lab_sg_soil" },
        { description: "Unconfined compressive strength (UCS) of soil samples", unit: "Nos", defaultRate: 1500, rateKey: "boq_lab_ucs_soil" },
        { description: "Consolidation tests on soils", unit: "Nos", is_qro: true, defaultRate: 3000, rateKey: "boq_lab_consolidation" },
        { description: "Triaxial undrained test (UU)", unit: "Nos", is_qro: true, defaultRate: 2500, rateKey: "boq_lab_triaxial_uu" },
        { description: "Direct shear tests", unit: "Nos", is_qro: true, defaultRate: 2000, rateKey: "boq_lab_direct_shear" },
        { description: "Chemical analysis of soil — pH, Chloride & Sulphate content", unit: "Nos", defaultRate: 1500, rateKey: "boq_lab_chemical_soil" },
        { description: "Chemical analysis of ground water — pH, Chloride & Sulphate content", unit: "Nos", defaultRate: 1500, rateKey: "boq_lab_chemical_water" },
        { description: "Water absorption & Porosity test on rock sample", unit: "Nos", defaultRate: 500, rateKey: "boq_lab_rock_water_absorption" },
        { description: "Dry Density of rock samples", unit: "Nos", defaultRate: 500, rateKey: "boq_lab_rock_density" },
      ],
    },
    {
      key: "c",
      label: "REPORT",
      items: [
        {
          description:
            "Preparation and submission of Geotechnical Investigation report with recommendations",
          unit: "LS",
          defaultQty: 1,
          defaultRate: 15000,
          rateKey: "boq_geotechnical_report",
        },
      ],
    },
  ],
  layout: {
    title: "FOUNDATION PILE — BILL OF QUANTITIES",
    hasRemarks: true,
    hasSummaryPage: false,
    hasCompanyInfo: false,
    hasProjectHeader: true,
    taxDisplay: "single_gst",
    showPaymentTermsOnPdf: false,
    showBankingOnPdf: false,
  },
  defaultNotes: [
    "Upon approval of the quotation, work will commence within three to four days, contingent upon receipt of the formal work order, advance payment, and site clearance. Final report only upon final payment.",
  ],
  defaultPaymentTerms: "",
};

export const BOQ_TYPE_3: TemplateDefinition = {
  id: TEMPLATE_IDS.BOQ_TYPE_3,
  name: "BOQ Type 3",
  description: "Regional BOQ — summary page, company info, depth tiers",
  sections: [
    {
      key: "1",
      label: "SOIL INVESTIGATION WORKS",
      items: [
        { description: "Mobilization & demobilization of boring equipment, personnel, machinery and transportation", unit: "Job", defaultQty: 1, defaultRate: 25000, rateKey: "boq_mobilisation" },
        {
          description:
            "Boring up to a depth of 10.0M or refusal stratum (N>50), whichever comes early, including SPT at regular intervals and collecting disturbed/undisturbed soil samples",
          unit: "RMT",
          subsection: "Boring Works",
          defaultRate: 700,
          rateKey: "boq_boring_soil_per_m",
          qtyDriver: { tier: { from: 0, to: 10 } },
        },
        {
          description:
            "Boring beyond 10.0M to 20.0M depth or refusal stratum (N>50), whichever comes early, including SPT and soil sampling",
          unit: "RMT",
          subsection: "Boring Works",
          defaultRate: 900,
          rateKey: "boq_boring_10_20m",
          qtyDriver: { tier: { from: 10, to: 20 } },
        },
        {
          description:
            "Boring beyond 20.0M to 30.0M depth or refusal stratum (N>50), whichever comes early, including SPT and soil sampling",
          unit: "RMT",
          subsection: "Boring Works",
          defaultRate: 1100,
          rateKey: "boq_boring_20_30m",
          qtyDriver: { tier: { from: 20, to: 30 } },
        },
        { description: "Boring beyond refusal strata for a depth of 3m", unit: "RMT", subsection: "Boring Works", defaultRate: 1600, rateKey: "boq_boring_refusal" },
        { description: "Drilling in weathered rock/refusal strata (SPT>100)", unit: "RMT", is_qro: true, subsection: "Boring Works", defaultRate: 1600, rateKey: "boq_boring_rock_per_m" },
        {
          description:
            "Field CBR Tests — collect in-situ undisturbed sample in CBR mould at 0.2M below GL, perform soaked and unsoaked CBR tests with index tests",
          unit: "Nos",
          defaultRate: 5000,
          rateKey: "boq_field_cbr",
        },
        {
          description:
            "Electrical Resistivity Test as per IS:1892 at electrode spacing 0.5-10m in N-S and E-W directions",
          unit: "Nos",
          defaultRate: 8000,
          rateKey: "boq_electrical_resistivity",
        },
        {
          description:
            "Laboratory tests, analysis, and submission of SI report (4 hard copies signed/sealed + 1 soft copy) including recommendations for foundations and local body approval forms",
          unit: "LS",
          defaultQty: 1,
          defaultRate: 15000,
          rateKey: "boq_report_with_lab",
        },
        {
          description:
            "Laboratory tests: Grain Size Analysis, Atterberg Limits, Natural Density & Moisture Content, Triaxial Tests, Consolidation Test, Free Swell Index, Rock Sample Tests (if encountered)",
          unit: "LS",
          defaultRate: 10000,
          rateKey: "boq_lab_comprehensive",
        },
        { description: "Third party inspection certificate for the borewell equipment", unit: "LS", defaultQty: 1, defaultRate: 3000, rateKey: "boq_third_party_inspection" },
        { description: "Workers insurance / Workmen Compensation Policy (WCP)", unit: "LS", defaultQty: 1, defaultRate: 5000, rateKey: "boq_workers_insurance" },
        { description: "Mobilisation and demobilisation charges and 1 day labour payment", unit: "LS", defaultQty: 1, defaultRate: 8000, rateKey: "boq_mob_demob_labour" },
      ],
    },
  ],
  layout: {
    title: "BILL OF QUANTITIES FOR SOIL INVESTIGATION WORKS",
    hasRemarks: true,
    hasSummaryPage: true,
    hasCompanyInfo: true,
    hasProjectHeader: false,
    taxDisplay: "summary_sheet",
    showPaymentTermsOnPdf: true,
    showBankingOnPdf: true,
  },
  defaultNotes: [
    "The provision of water for drilling purposes at borehole location to be made by the client.",
    "Clean place to make hutment or room for labour's accommodation (at site) should be arranged by client.",
    "Upon approval of the quotation, work will commence within 3-4 days, contingent upon receipt of the formal work order, advance payment, and site clearance. Final report only upon final payment.",
    "Clear access to the borehole location to be provided by client.",
    "The Reduced Levels of Borehole point to be provided by client before completion of field work.",
    "Permission from authorities to work in project area shall be taken by client.",
    "Any disturbance due to local problems shall be tackled by the client. Additional charges shall be applied for demobilisation of equipment.",
    "The rates presented herewith are valid only for a period of 30 days from the date of quotation.",
    "The quantities presented herewith are assumed on the basis of working in the general project area. Actual quantities may vary and the final billing shall be done on the basis of actual quantities only.",
  ],
  defaultPaymentTerms:
    "50% of quoted charges along with work order | 40% on completion of field work & before submission of report | 10% on submission of report",
};

export const DEFAULT_TEMPLATES: TemplateDefinition[] = [
  BOQ_TYPE_1,
  BOQ_TYPE_2,
  BOQ_TYPE_3,
];

export function getTemplateById(id: string): TemplateDefinition | undefined {
  return DEFAULT_TEMPLATES.find((t) => t.id === id);
}
