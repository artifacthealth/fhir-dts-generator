/// <reference path="../typings/node.d.ts" />
/// <reference path="../typings/glob.d.ts" />

import glob = require("glob");
import fs = require("fs");

var examples = "",
    count = 1;

glob.sync("/Users/meir/Downloads/fhir-spec-dstu2/" + "**example*.json").forEach(filename => {
    var example = JSON.parse(fs.readFileSync(filename, 'utf8'));
    examples += "var example" + (count++) + ": fhir." + example.resourceType + " = " + JSON.stringify(example, null, "    ") + ";\n\n";
});

fs.writeFileSync("fhir-tests.ts", examples, "utf8");
