/// <reference path="./types.d.ts" />
/// <reference path="../typings/mkdirp.d.ts" />

import reader = require("./reader");
import processor = require("./processor");
import emitter = require("./emitters/declartionEmitter");
import fs = require("fs");
import mkdirp = require("mkdirp");

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

process.exit(errors.length);

function reportErrors(errors: string[]): void {

    for(var i = 0; i < errors.length; i++) {
        console.log(errors[i]);
    }
}
