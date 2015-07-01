/// <reference path="./types.d.ts" />
/// <reference path="../typings/mkdirp.d.ts" />
/// <reference path="../typings/glob.d.ts" />

import fs = require("fs");
import path = require("path");
import mkdirp = require("mkdirp");
import glob = require("glob");

import reader = require("./reader");
import processor = require("./processor");
import emitter = require("./emitters/declartionEmitter");


var errors: string[];

var specDir = "/Users/meir/Downloads/fhir-spec-dstu2/";
var outDir = "out";

mkdirp.sync(outDir);

var readerResult = reader.readSpecification(specDir);
errors = readerResult.errors;

if(errors.length == 0) {
    var processorResult = processor.processFiles(readerResult.files);
    errors = processorResult.errors;
}

if(errors.length == 0) {
    var emitResults = emitter(outDir, processorResult.types);
    errors = emitResults.errors;
}

reportErrors(errors);
createDeclarationTests(specDir, outDir);

process.exit(errors.length);

function reportErrors(errors: string[]): void {

    for(var i = 0; i < errors.length; i++) {
        console.log(errors[i]);
    }
}

function createDeclarationTests(specDir: string, outDir: string): void {
    var examples = "",
        count = 1;

    glob.sync(path.join(specDir, "**/*example*.json")).forEach(filename => {
        var example = JSON.parse(fs.readFileSync(filename, 'utf8'));
        examples += "var example" + (count++) + ": fhir." + example.resourceType + " = " + JSON.stringify(example, null, "    ") + ";\n\n";
    });

    fs.writeFileSync(path.join(outDir, "fhir-tests.ts"), examples, "utf8");

}