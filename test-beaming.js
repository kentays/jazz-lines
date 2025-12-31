import { buildJazzLine } from "./src/theory/lineBuilder.js";
import { parseNote } from "./src/theory/noteParser.js";

// Helper function to simulate the beaming logic from NotationView
function simulateBeaming(noteCount, tripletStartIndex) {
  const vexNotes = Array(noteCount).fill(null).map((_, i) => ({ id: i }));
  const beams = [];
  const beamedIndices = new Set();
  const hasValidTriplet = tripletStartIndex >= 0 && tripletStartIndex + 3 <= vexNotes.length;
  
  // First, handle triplet if present
  if (hasValidTriplet) {
    const tripletGroup = vexNotes.slice(tripletStartIndex, tripletStartIndex + 3);
    if (tripletGroup.length === 3) {
      beams.push({
        type: "triplet",
        notes: tripletGroup.map(n => n.id),
        startIndex: tripletStartIndex,
        endIndex: tripletStartIndex + 2
      });
      beamedIndices.add(tripletStartIndex);
      beamedIndices.add(tripletStartIndex + 1);
      beamedIndices.add(tripletStartIndex + 2);
    }
  }

  // Then, beam remaining notes in groups of 4
  let i = 0;
  while (i < vexNotes.length) {
    if (beamedIndices.has(i)) {
      i++;
      continue;
    }
    
    const group = [];
    let j = i;
    while (group.length < 4 && j < vexNotes.length) {
      if (!beamedIndices.has(j)) {
        group.push(vexNotes[j]);
      }
      j++;
    }
    
    if (group.length >= 2) {
      beams.push({
        type: "regular",
        notes: group.map(n => n.id),
        startIndex: group[0].id,
        endIndex: group[group.length - 1].id
      });
    }
    
    i = j;
  }

  return beams;
}

console.log("=== Testing Beaming Logic for 9-Note Line ===\n");

// Test 1: Create a 9-note line
console.log("Test 1: Building a 9-note line");
const noteStrings = ["A5", "A5", "A5", "A5", "A5", "A5", "A5", "A5", "A5"];
const notes = noteStrings.map(parseNote);
const line = buildJazzLine(notes);

console.log(`✓ Created line with ${line.notes.length} notes`);
console.log(`✓ tripletStartIndex: ${line.tripletStartIndex}`);
console.log(`✓ Expected tripletStartIndex: 6`);
if (line.tripletStartIndex === 6) {
  console.log("✅ PASS: tripletStartIndex is correctly set to 6\n");
} else {
  console.log("❌ FAIL: tripletStartIndex should be 6\n");
}

// Test 2: Simulate beaming for 9-note line with triplet at index 6
console.log("Test 2: Simulating beaming for 9-note line with triplet at index 6");
const beams = simulateBeaming(9, 6);

console.log(`Total beams created: ${beams.length}`);
beams.forEach((beam, idx) => {
  console.log(`  Beam ${idx + 1}: ${beam.type} - notes [${beam.notes.join(", ")}]`);
});

console.log("\nExpected beaming:");
console.log("  Beam 1: regular - notes [0, 1, 2, 3]");
console.log("  Beam 2: regular - notes [4, 5]");
console.log("  Beam 3: triplet - notes [6, 7, 8]");

if (beams.length === 3 &&
    beams[0].type === "triplet" &&
    JSON.stringify(beams[0].notes) === "[6,7,8]" &&
    beams[1].type === "regular" &&
    JSON.stringify(beams[1].notes) === "[0,1,2,3]" &&
    beams[2].type === "regular" &&
    JSON.stringify(beams[2].notes) === "[4,5]") {
  console.log("\n✅ PASS: Beaming logic correctly groups notes\n");
} else {
  console.log("\n❌ FAIL: Beaming logic not working correctly");
  console.log("Got:", JSON.stringify(beams));
  console.log("Expected: triplet [6,7,8], regular [0,1,2,3], regular [4,5]\n");
}

// Test 3: Test different triplet positions
console.log("Test 3: Testing triplet at different positions");
const testCases = [
  { tripletPos: 0, desc: "start" },
  { tripletPos: 3, desc: "middle" },
  { tripletPos: 6, desc: "end" }
];

testCases.forEach(({ tripletPos, desc }) => {
  const testBeams = simulateBeaming(9, tripletPos);
  console.log(`  Triplet at position ${tripletPos} (${desc}): ${testBeams.length} beams created`);
  testBeams.forEach(beam => {
    console.log(`    - ${beam.type}: [${beam.notes.join(", ")}]`);
  });
});

console.log("\n=== All Tests Complete ===");
