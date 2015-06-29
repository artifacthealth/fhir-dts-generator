/// <reference path="./types.d.ts" />

import reader = require("./reader");
import processor = require("./processor");
import emitter = require("./emitter");


var errors: string[];

var readerResult = reader.readSpecification("/Users/meir/Downloads/fhir-spec/");
errors = readerResult.errors;

if(errors.length == 0) {
    var processorResult = processor.processFiles(readerResult.files);
    errors = processorResult.errors;
}

if(errors.length == 0) {
    var emitResults = emitter.emitFiles("out", processorResult.types);
    errors = emitResults.errors;
}

reportErrors(errors);

process.exit(errors.length);

function reportErrors(errors: string[]): void {

    for(var i = 0; i < errors.length; i++) {
        console.log(errors[i]);
    }
}
