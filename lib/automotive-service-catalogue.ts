export const vehicleTypes = [
  "car_van",
  "motorcycle_scooter",
  "electric_bicycle",
  "electric_kick_scooter",
] as const;

export type AutomotiveVehicleType = (typeof vehicleTypes)[number];
export type ServiceBookingMode = "diagnosis" | "diagnosis_first" | "direct";

export type StandardServiceTemplate = {
  code: string;
  vehicleType: AutomotiveVehicleType;
  category: string;
  name: string;
  bookingMode: ServiceBookingMode;
};

const diagnosticNames = new Set([
  "Diagnosis", "Warning light or fault-code diagnostics", "Vehicle will not start",
  "Noise, vibration, smell, smoke, or fluid leak", "I'm not sure what's wrong",
  "Motorcycle diagnostics", "Warning light or ECU diagnostics", "Starting problem",
  "Electrical fault finding", "Noise, vibration, smoke, leak, or running problem",
  "Complete e-bike diagnostic", "Error-code/system scan", "Electrical fault tracing",
  "Complete diagnostic", "Error-code diagnosis", "Scooter will not switch on",
  "Loss of power or intermittent shutdown", "Noise, vibration, or instability",
]);

const directCategories = new Set([
  "Routine servicing", "Tyres and wheels", "Motorcycle scheduled servicing",
  "Motorcycle tyres and wheels", "Chain, sprockets, and final drive",
  "Accessories and upgrades", "Accessories and customization",
  "Accessories and conversions", "Accessories", "Routine servicing",
]);

const definitions: Record<AutomotiveVehicleType, Record<string, string[]>> = {
  car_van: {
    "Diagnostics and inspections": ["Diagnosis", "Warning light or fault-code diagnostics", "Vehicle will not start", "Noise, vibration, smell, smoke, or fluid leak", "General mechanical inspection", "Pre-purchase inspection", "Roadworthiness inspection / ITP preparation", "I'm not sure what's wrong"],
    "Routine servicing": ["Oil and oil-filter change", "Interim service", "Full service", "Major service", "Manufacturer-scheduled service", "Fluid and filter replacement"],
    "Tyres and wheels": ["Seasonal tyre change", "New tyre fitting", "Puncture repair", "Wheel balancing", "Wheel alignment", "Tyre rotation", "TPMS diagnosis or sensor replacement", "Rim inspection or repair", "Customer-supplied tyre fitting"],
    Brakes: ["Brake inspection", "Brake-pad replacement", "Brake-disc replacement", "Brake-fluid change", "Handbrake repair", "Brake caliper repair", "ABS diagnosis or repair"],
    "Battery and electrical": ["Battery test or replacement", "Alternator repair", "Starter motor repair", "Lighting or bulb replacement", "Electrical fault diagnosis", "Wiring repair"],
    "Engine and cooling": ["Engine diagnosis or repair", "Cooling-system diagnosis", "Radiator repair", "Water-pump replacement", "Coolant change", "Head-gasket repair", "Engine rebuild"],
    "Timing and drive belts": ["Timing-belt replacement", "Timing-chain inspection or replacement", "Auxiliary/serpentine-belt replacement"],
    "Clutch and transmission": ["Clutch diagnosis or replacement", "Flywheel replacement", "Manual gearbox repair", "Automatic transmission service", "Transmission-fluid or gearbox-oil change", "Gear-selection problem"],
    "Suspension and steering": ["Suspension inspection", "Shock absorber or spring replacement", "Control arm, bush, or ball-joint replacement", "Wheel-bearing replacement", "Power-steering repair", "Steering alignment issue"],
    "Exhaust and emissions": ["Exhaust repair or replacement", "Catalytic-converter replacement", "DPF cleaning or regeneration", "EGR diagnosis or replacement", "Emissions diagnosis"],
    "Heating and air conditioning": ["Air-conditioning inspection", "Air-conditioning recharge", "Air-conditioning repair", "Heating or blower repair", "Cabin-filter replacement"],
    "Electric and hybrid vehicles": ["EV/hybrid scheduled service", "High-voltage battery health check", "Charging-system diagnosis", "Charging-port repair", "EV cooling-system service"],
    "Bodywork and glass": ["Accident-damage estimate", "Dent or scratch repair", "Paintwork", "Bumper repair", "Windscreen or window replacement", "Rust repair"],
    "Accessories and upgrades": ["Dashcam installation", "Parking sensor or reversing-camera installation", "Tow-bar fitting", "Audio or infotainment installation", "Performance upgrade", "Other accessory installation"],
  },
  motorcycle_scooter: {
    "Motorcycle diagnostics": ["Diagnosis", "Motorcycle diagnostics", "Warning light or ECU diagnostics", "Starting problem", "Electrical fault finding", "Noise, vibration, smoke, leak, or running problem", "I'm not sure what's wrong"],
    "Motorcycle scheduled servicing": ["Oil and filter change", "Basic service", "Annual service", "Intermediate service", "Major service", "Manufacturer-scheduled service", "Valve-clearance inspection or adjustment"],
    "Motorcycle tyres and wheels": ["Front motorcycle tyre change and balancing", "Rear motorcycle tyre change and balancing", "Front and rear tyre change and balancing", "Customer-supplied tyre fitting and balancing", "Motorcycle puncture repair", "Inner-tube replacement", "Tubeless tyre repair", "Wheel-only tyre fitting", "Motorcycle wheel balancing", "Wheel-bearing replacement", "Rim inspection or repair"],
    "Motorcycle brakes": ["Brake inspection", "Brake-pad or shoe replacement", "Brake-disc replacement", "Brake-fluid change", "Brake-caliper service or rebuild", "ABS diagnosis"],
    "Chain, sprockets, and final drive": ["Chain clean, lubricate, and adjust", "Chain replacement", "Chain-and-sprocket kit replacement", "Belt-drive inspection or replacement", "Shaft-drive service"],
    "Suspension and steering": ["Fork-seal replacement", "Fork-oil change", "Front-fork overhaul", "Rear shock service or replacement", "Steering-head bearing replacement", "Swingarm or suspension-linkage service"],
    "Battery and electrical": ["Battery test or replacement", "Charging-system diagnosis", "Starter-motor repair", "Lighting repair", "Wiring diagnosis", "Accessory electrical installation"],
    "Fuel and intake system": ["Fuel-injection diagnosis", "Injector cleaning", "Carburettor cleaning or rebuild", "Carburettor/throttle-body synchronization", "Fuel-tank or fuel-system cleaning", "Air-filter replacement"],
    "Engine, clutch, and transmission": ["Engine diagnosis or repair", "Spark-plug replacement", "Clutch adjustment or replacement", "Gearbox repair", "Coolant change", "Radiator repair", "Engine rebuild"],
    "Scooter-specific services": ["CVT inspection or service", "Drive-belt replacement", "Variator or roller replacement", "Scooter clutch service"],
    "Motorcycle inspections": ["Safety inspection", "Roadworthiness / ITP preparation", "Pre-purchase inspection", "Post-accident inspection", "Seasonal inspection"],
    "Accessories and customization": ["Exhaust installation", "Luggage, pannier, or top-box fitting", "Heated-grip installation", "Windscreen or protection fitting", "Performance-parts installation", "Customization request"],
  },
  electric_bicycle: {
    "Diagnostics and safety": ["Diagnosis", "Complete e-bike diagnostic", "Error-code/system scan", "General safety inspection", "Electrical fault tracing", "I'm not sure what's wrong", "Accident or water-damage inspection"],
    "Routine servicing": ["Basic tune-up", "Full e-bike service", "Manufacturer-scheduled service", "Cleaning and lubrication", "Bolt and torque inspection", "Firmware and system check"],
    "Battery and charging": ["Battery health and capacity test", "Battery not charging", "Reduced-range diagnosis", "Battery replacement", "Charging-port repair", "Charger testing or replacement", "Battery-mount or lock repair"],
    "Motor and assistance system": ["Hub-motor diagnostics or replacement", "Mid-drive motor diagnostics or replacement", "Motor noise or power-loss diagnosis", "Pedal-assist sensor repair", "Torque or cadence sensor replacement", "Walk-assist fault", "Motor-bearing service"],
    "Controller, display, and electronics": ["Controller diagnostics or replacement", "Display repair or replacement", "Control-button repair", "Speed-sensor repair", "Wiring or connector repair", "Lighting repair", "Firmware update"],
    "E-bike tyres and wheels": ["Puncture repair", "Inner-tube replacement", "Tubeless tyre repair", "Front tyre replacement", "Rear tyre replacement", "Front and rear tyre replacement", "Wheel truing", "Spoke replacement", "Wheel-bearing replacement", "Motor-wheel removal and refitting"],
    Brakes: ["Brake inspection or adjustment", "Brake-pad replacement", "Brake-disc replacement", "Hydraulic brake bleeding", "Brake-cable replacement", "Full brake overhaul"],
    Drivetrain: ["Chain replacement", "Cassette or freewheel replacement", "Chainring replacement", "Derailleur adjustment or replacement", "Gear indexing", "Crank or bottom-bracket service", "Belt-drive inspection or replacement"],
    "Frame, steering, and suspension": ["Headset adjustment or replacement", "Fork service", "Suspension service", "Frame inspection", "Handlebar or stem replacement", "Mudguard or rack repair"],
    "Accessories and conversions": ["E-bike conversion-kit installation", "Lighting installation", "Rack, basket, or child-seat fitting", "GPS tracker installation", "Lock installation", "Other accessory fitting"],
  },
  electric_kick_scooter: {
    "Diagnostics and safety": ["Diagnosis", "Complete diagnostic", "Error-code diagnosis", "General safety inspection", "Scooter will not switch on", "Loss of power or intermittent shutdown", "Noise, vibration, or instability", "Water-damage inspection", "I'm not sure what's wrong"],
    "Tyres and wheels": ["Puncture repair", "Inner-tube replacement", "Pneumatic tyre replacement", "Tubeless tyre repair or replacement", "Solid tyre installation", "Front tyre replacement", "Rear/motor-wheel tyre replacement", "Wheel or rim replacement", "Wheel-bearing replacement"],
    "Battery and charging": ["Battery health test", "Reduced-range diagnosis", "Battery replacement", "Battery connection repair", "Charging-port replacement", "Charger test or replacement", "Battery-management-system diagnosis"],
    "Motor and controller": ["Hub-motor diagnosis", "Motor replacement", "Controller diagnosis or replacement", "Power-loss diagnosis", "Overheating diagnosis", "Hall-sensor or motor-wiring repair"],
    "Controls and electronics": ["Display or dashboard replacement", "Throttle replacement", "Brake-sensor replacement", "Wiring repair", "Front or rear light repair", "Indicator repair", "Horn repair", "Firmware update or recovery"],
    Brakes: ["Brake inspection or adjustment", "Brake-pad replacement", "Brake-disc replacement", "Brake-cable replacement", "Hydraulic brake bleeding", "Electronic/regenerative brake diagnosis"],
    "Steering, folding, and frame": ["Folding-mechanism adjustment or replacement", "Stem wobble repair", "Handlebar repair", "Steering-bearing replacement", "Frame inspection", "Kickstand replacement", "Deck or footboard repair"],
    Suspension: ["Front suspension service", "Rear suspension service", "Shock replacement", "Suspension upgrade installation"],
    Accessories: ["Lighting upgrade", "Mudguard replacement", "Phone holder or storage fitting", "GPS tracker installation", "Anti-theft accessory installation", "Other accessory fitting"],
  },
};

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const standardServiceTemplates: StandardServiceTemplate[] = vehicleTypes.flatMap(
  (vehicleType) => Object.entries(definitions[vehicleType]).flatMap(([category, names]) =>
    names.map((name) => ({
      code: name === "Diagnosis" ? "diagnosis" : `${vehicleType}-${slug(name)}`,
      vehicleType,
      category,
      name,
      bookingMode: name === "Diagnosis"
        ? "diagnosis"
        : diagnosticNames.has(name) || (!directCategories.has(category) && /diagnos|fault|problem|repair|replacement|damage|noise|leak|loss|overheat/i.test(name))
          ? "diagnosis_first"
          : "direct",
    })),
  ),
);

export const standardServiceCategories = [...new Set(
  standardServiceTemplates.map((service) => service.category),
)];
