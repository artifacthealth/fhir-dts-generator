### Description
This project generates TypeScript DTS as well as a tests from the FHIR Release 4 Specification.

### Installation
1. Install node packages
```sh
$ npm install
```

2. Install Grunt globally
```sh
$ npm install -g grunt
```

3. Run grunt from the project directory.
```sh
$ grunt
```

### Notes
* The FHIR specification is downloaded and unzipped automatically on the first run.
* You can update the version of the specification downloaded by changing the URL in the Gruntfile.

### License
ISC License (ISC)
Copyright 2017 Artifact Health, Inc.

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.