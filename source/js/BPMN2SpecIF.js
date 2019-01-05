/* 	Transform BPMN-XML to SpecIF
	Author: Robert Kanitz, adesso AG
	License: Apache 2.0
*/

// Durchlaufen der XML Datei und Überführen der Elemente in das SpecIF Format
function BPMN2Specif( xmlString, opts ) {
	"use strict";
	var parser = new DOMParser();
	var xmlDoc = parser.parseFromString(xmlString, "text/xml");
	var typ, id, name, source, target, stereotype;
	var elements = new Array();
	var x, y;

	x = xmlDoc.querySelectorAll("collaboration");
	console.debug('x',x);
	typ = x[0].nodeName; // Name des Diagramms
	id = x[0].getAttribute("id");
	name = opts.fileName.split(".")[0];
	elements.push(resourceFinder(typ, id, name, source, target));

	// Prozesse im Diagramm umwandeln:
	y = xmlDoc.querySelectorAll("process"); 
	x = x[0].childNodes;
	x.forEach( function(xe) {
		if (xe.nodeName.includes("participant")) {
			y.forEach( function(ye) {
				if ( ye.nodeName.includes("process")
					&& (xe.getAttribute("processRef") == ye.getAttribute("id")) ) {
						elements = elements.concat(analyzeProcess(ye, xe.getAttribute("id"), xe.getAttribute("name")))
				}
			})
		}
	});

	// Nachrichtenflüsse umwandeln:
	x.forEach( function(xe) { 
		if (xe.nodeName.includes("messageFlow")) {
			typ = xe.nodeName;
			id = xe.getAttribute("id");
			name = xe.getAttribute("name");
			source = xe.getAttribute("sourceRef");
			target = xe.getAttribute("targetRef");
			elements = elements.concat(statementFinder(elements, typ, id, name, source, target))
		}
	});

	// Beziehungen zwischen Diagramm und Elementen herstellen:
	id = 1;
	elements.forEach( function(el) { 
		if (el.resourceType == "RT-Act" || el.resourceType == "RT-Evt" || el.resourceType == "RT-Sta") {
			elements.push({
				id: "Diagram_shows_" + id,
				title: "SpecIF:shows",
				statementType: "ST-Visibility",
				subject: elements[0].id,
				object: el.id,
				changedAt: opts.fileDate
			});
			id++
		}
	});
//	var clonedArray = JSON.parse(JSON.stringify(elements));
	console.debug(elements);
	return modelBuilder( elements, opts );

// called functions:	
	function analyzeProcess(nodeList, participantId, name) {
		var typ, id, name, source, target, stereotype;
		var i, x;
		var erg = new Array();

		if (name == "Hauptprozess") {
			return erg
		};
		erg.push(resourceFinder(nodeList.nodeName, participantId, name, null, null, "participant"));

		// Erstellen aller Ressourcen und Platzhaltern für Gateways:
		x = nodeList.childNodes;
		x.forEach( function(xe) {
			if (xe.nodeName != "#text" && xe.nodeName != "bpmn:sequenceFlow" && xe.nodeName != "sequenceFlow" && xe.nodeName != "extensionElements" && xe.nodeName != "laneSet" && xe.nodeName != "documentation") {
				typ = xe.nodeName;
				id = xe.getAttribute("id");
				name = xe.getAttribute("name");
				source = xe.getAttribute("sourceRef");
				target = xe.getAttribute("targetRef");
				erg.push(resourceFinder(typ, id, name, source, target, stereotype));
			}
		});

		// Statements zwischen den Ressourcen und Platzhaltern für Gateways erstellen:
		x.forEach( function(xe) {
			if (xe.nodeName == "bpmn:sequenceFlow" || xe.nodeName == "sequenceFlow") {
				typ = xe.nodeName;
				id = xe.getAttribute("id");
				name = xe.getAttribute("name");
				source = xe.getAttribute("sourceRef");
				target = xe.getAttribute("targetRef");
				erg.push(statementFinder(erg, typ, id, name, source, target));
			}
		});

		resolveGateways(erg); // Auflösen der Gateways 

		// Beziehungen zwischen Prozess Elementen herstellen:
		id = 1;
		// Beziehungen zwischen Prozess Elementen herstellen:
		id = 1;
		for (i = 1; i < erg.length; i++) { 
			if (erg[i].resourceType == "RT-Act" || erg[i].resourceType == "RT-Evt" || erg[i].resourceType == "RT-Sta") {
				erg.push({
					id: erg[0].id + "_contains_" + id,
					title: "SpecIF:contains",
					statementType: "ST-Containment",
					subject: erg[0].id,
					object: erg[i].id,
					changedAt: opts.fileDate
				});
				id++;
			}
		};
		return erg
	}

	// BPMN-Elemente (außer verbindende Objekte) in SpecIF Ressourcen übersetzen:
	function resourceFinder(typ, id, name, source, target, stereotype) {
		// Anpassung für BPMN.io, da dort bpmn: im Tag verwendet wird
		if (typ.includes("bpmn:")) { 
			typ = typ.split(":")[1];
		};
		if (typeof(stereotype) == "undefined") {
			stereotype = typ;
		};

		switch (typ) {
			case "collaboration":
				var properties = new Array();
				properties.push({
					title: "dcterms:title",
					propertyType: "PT-Pln-Name",
					value: name
				}, {
					title: "SpecIF:Diagram",
					propertyType: "PT-Pln-Diagram",
					value: "<div><p> Dies ist der hochgeladene BPMN-Prozess" +
						" </p><p class=\"inline-label\"> Model View: </p><div class=\"forImage\" style=\"max-width: 600px;\" > <object " +
						"data=\"BusinessProcess.svg\" type=\"image/svg+xml\" >BusinessProcess</object></div></div>"
				}, {
					title: "SpecIF:Notation",
					propertyType: "PT-Pln-Notation",
					value: "BPMN 2.0 Process Diagram"
				});
				return {
					id: id,
					title: name,
					properties: properties,
					resourceType: "RT-Pln",
					changedAt: opts.fileDate
				};

			case "startEvent":
			case "intermediateThrowEvent":
			case "endEvent":
				var properties = new Array();
				properties.push({
					title: "dcterms:title",
					propertyType: "PT-Evt-Name",
					value: name
				}, {
					title: "SpecIF:Stereotype",
					propertyType: "PT-Evt-Stereotype",
					value: stereotype
				});
				return {
					id: id,
					title: name,
					properties: properties,
					resourceType: "RT-Evt",
					changedAt: opts.fileDate
				};

			case "participant":
			case "process":
			case "task":
			case "userTask":
				var properties = new Array();
				properties.push({
					title: "dcterms:title",
					propertyType: "PT-Act-Name",
					value: name
				}, {
					title: "SpecIF:Stereotype",
					propertyType: "PT-Act-Stereotype",
					value: stereotype
				});
				return {
					id: id,
					title: name,
					properties: properties,
					resourceType: "RT-Act",
					changedAt: opts.fileDate
				};

			case "dataObjectReference":
				var properties = new Array();
				properties.push({
					title: "dcterms:title",
					propertyType: "PT-Sta-Name",
					value: name
				}, {
					title: "SpecIF:Stereotype",
					propertyType: "PT-Sta-Stereotype",
					value: stereotype
				});
				return {
					id: id,
					title: name,
					properties: properties,
					resourceType: "RT-Sta",
					changedAt: opts.fileDate
				};

			case "parallelGateway":
				var incoming = new Array();
				var outgoing = new Array();
				return {
					id: id,
					title: name,
					incoming: incoming,
					outgoing: outgoing,
					resourceType: "parallelGateway",
					changedAt: opts.fileDate
				};

			case "exclusiveGateway":
				var incoming = new Array();
				var outgoing = new Array();
				return {
					id: id,
					title: name,
					incoming: incoming,
					outgoing: outgoing,
					resourceType: "exklusiveGateway",
					changedAt: opts.fileDate
				};

			default:
				return "unknown element";
		}
	}

	// Nachrichten- oder Sequenzfluss in SpecIF-Elemente übersetzen:
	function statementFinder(elements, typ, id, name, source, target) {
		if (typ.includes("bpmn:")) {
			typ = typ.split(":")[1];
		}
		var subject = elements.find(function(resource) {
			return resource.id == source;
		});
		var object = elements.find(function(resource) {
			return resource.id == target;
		});

		switch (typ) {
			case "messageFlow":
				var erg = [];
				erg.push(resourceFinder("dataObjectReference", id + "_1", name, null, null, "messageFlow"));
				erg.push({
					id: id + "_2",
					title: "SpecIF:writes",
					statementType: "ST-Writing",
					subject: subject.id,
					object: id + "_1",
					changedAt: opts.fileDate
				});
				erg.push({
					id: id + "_3",
					title: "SpecIF:reads",
					statementType: "ST-Reading",
					subject: object.id,
					object: id + "_1",
					changedAt: opts.fileDate
				});

				var statementCount, participant;
				statementCount = 0;
				if (subject.properties[1].value == "participant") { // Ist das Subjekt ein Pool bzw. Participant?
					elements.forEach( function(el) {
						if (el.title == "SpecIF:contains" && el.subject == subject.id) {
							statementCount++;
						}
					});
					erg.push({
						id: subject.id + "_contains_" + (statementCount + 1),
						title: "SpecIF:contains",
						statementType: "ST-Containment",
						subject: subject.id,
						object: id + "_1",
						changedAt: opts.fileDate
					})
				} else {
					elements.forEach( function(el) {
						if (el.title == "SpecIF:contains" && el.object == subject.id) {
							participant = elements.find(function(resource) {
								return resource.id == el.subject;
							});
						}
					});
					elements.forEach( function(el) {
						if (el.title == "SpecIF:contains" && el.subject == participant.id) {
							statementCount++;
						}
					});
					erg.push({
						id: participant.id + "_contains_" + (statementCount + 1),
						title: "SpecIF:contains",
						statementType: "ST-Containment",
						subject: participant.id,
						object: id + "_1",
						changedAt: opts.fileDate
					})
				};
				statementCount = 0;
				if (object.properties[1].value == "participant") { // Ist das Objekt ein Pool bzw. Participant?
					elements.forEach( function(el) {
						if (el.title == "SpecIF:contains" && el.subject == object.id) {
							statementCount++;
						}
					});
					erg.push({
						id: object.id + "_contains_" + (statementCount + 1),
						title: "SpecIF:contains",
						statementType: "ST-Containment",
						subject: object.id,
						object: id + "_1",
						changedAt: opts.fileDate
					})
				} else {
					elements.forEach( function(el) { // Schleife zum Finden des Teilnehmers bzw. Pools
						if (el.title == "SpecIF:contains" && el.object == object.id) {
							participant = elements.find(function(resource) {
								return resource.id == el.subject;
							})
						}
					});
					elements.forEach( function(el) {
						if (el.title == "SpecIF:contains" && el.subject == participant.id) {
							statementCount++;
						}
					});
					erg.push({
						id: participant.id + "_contains_" + (statementCount + 1),
						title: "SpecIF:contains",
						statementType: "ST-Containment",
						subject: participant.id,
						object: id + "_1",
						changedAt: opts.fileDate
					})
				};
				return erg;

			case "sequenceFlow":
				if (subject.resourceType == "RT-Act" && object.resourceType == "RT-Act") {
					return {
						id: id,
						title: "SpecIF:precedes",
						statementType: "ST-Preceding",
						subject: subject.id,
						object: object.id,
						changedAt: opts.fileDate
					}
				};
				if ((subject.resourceType == "RT-Act" || subject.resourceType == "RT-Evt") && object.resourceType == "RT-Evt") {
					return {
						id: id,
						title: "SpecIF:signals",
						statementType: "ST-Signalling",
						subject: subject.id,
						object: object.id,
						changedAt: opts.fileDate
					}
				};
				if (subject.resourceType == "RT-Evt" && object.resourceType == "RT-Act") {
					return {
						id: id,
						title: "SpecIF:triggers",
						statementType: "ST-Triggering",
						subject: subject.id,
						object: object.id,
						changedAt: opts.fileDate
					}
				};
				if (subject.resourceType == "parallelGateway" || subject.resourceType == "exklusiveGateway") {
					subject.outgoing.push({
						id: id,
						title: name,
						statementType: "gatewayFlow",
						subject: subject.id,
						object: object.id,
						changedAt: opts.fileDate
					})
				};
				if (object.resourceType == "parallelGateway" || object.resourceType == "exklusiveGateway") {
					object.incoming.push({
						id: id,
						title: name,
						statementType: "gatewayFlow",
						subject: subject.id,
						object: object.id,
						changedAt: opts.fileDate
					})
				};

				return {
					id: id,
					title: name,
					statementType: "gatewayFlow",
					subject: subject.id,
					object: object.id,
					changedAt: opts.fileDate
				};

			default:
				return "unknown element";
		}
	}

	// Ressourcen und Statements aus den Gateways und ihren Sequenzflüssen herstellen
	// ! Funktioniert nicht bei direkt aufeinanderfolgenden Gateways !
	function resolveGateways(elements) {
		elements.forEach( function(el) {
			if (el.resourceType == "parallelGateway" && el.incoming.length == 1) { // Paralleles Gateway ausgehend 1 -> x
				el.outgoing.forEach( function(outg) {
					outg.subject = el.incoming[0].subject;
					elements.push(statementFinder(elements, "sequenceFlow", outg.id, "", outg.subject, outg.object));
				})
			};

			if (el.resourceType == "parallelGateway" && el.outgoing.length == 1) { // Paralleles Gateway eingehend x -> 1
				elements.push(resourceFinder("task", el.id, "Warte auf vorherige Elemente", null, null, "parallelGateway"));
				el.id = null;
				elements.push(statementFinder(elements, "sequenceFlow", el.outgoing[0].id, "", el.outgoing[0].subject, el.outgoing[0].object));
				el.incoming.forEach( function(inco) {
					elements.push(statementFinder(elements, "sequenceFlow", inco.id, "", inco.subject, inco.object));
				})
			};

			if (el.resourceType == "exklusiveGateway" && el.incoming.length == 1) { // Exklusives Gateway ausgehend 1 -> x
				for ( var j = 0; j < el.outgoing.length; j++) {
					elements.push(resourceFinder("intermediateThrowEvent", el.id + "_" + j, el.outgoing[j].title, null, null, "exklusiveGateway"));
					elements.push(statementFinder(elements, "sequenceFlow", el.incoming[0].id + "_" + j, "", el.incoming[0].subject, el.id + "_" + j));
					elements.push(statementFinder(elements, "sequenceFlow", el.outgoing[j].id, "", el.id + "_" + j, el.outgoing[j].object));
				}
			};

			if (el.resourceType == "exklusiveGateway" && el.outgoing.length == 1) { // Exklusives Gateway eingehend x -> 1
				el.incoming.forEach( function(inco) {
					inco.object = el.outgoing[0].object;
					elements.push(statementFinder(elements, "sequenceFlow", inco.id, "", inco.subject, inco.object));
				})
			}
		});

		// Gateways entfernen:
		let i = 0;
		while ( i<elements.length ) {
			if (elements[i].statementType == "gatewayFlow" || elements[i].resourceType == "parallelGateway" || elements[i].resourceType == "exklusiveGateway") {
				elements.splice(i, 1);
			} else {
				i++
			}
		}
	}

	// SpecIF Projekt im JSON Format bauen:
	function modelBuilder( elements, opts ) {
		var d = new Date();
		var model = new Object();	// process model in SpecIF/JSON format
		model.id = "BPMN-" + (d.getDate() + "" + d.getMonth() + "" + d.getFullYear() + "" + d.getHours() + "" + d.getMinutes() + "" + d.getSeconds());
		model.title = opts.title;
		model.description = opts.description;
		model.specifVersion = "0.10.3";

		// Benötigte Datentypen definieren
		var dataTypes = new Array(); 
		dataTypes.push({
			id: "DT-Integer",
			title: "Integer",
			type: "xs:integer",
			min: -32768,
			max: 32767,
			changedAt: opts.fileDate
		});
		dataTypes.push({
			id: "DT-ShortString",
			title: "String[96]",
			description: "String with length 96",
			type: "xs:string",
			maxLength: 96,
			changedAt: opts.fileDate
		});
		dataTypes.push({
			id: "DT-String",
			title: "String[1024]",
			description: "String with length 1024",
			type: "xs:string",
			maxLength: 1024,
			changedAt: opts.fileDate
		});
		dataTypes.push({
			id: "DT-formattedText",
			title: "xhtml[1024]",
			description: "Formatted String with length 1024",
			type: "xhtml",
			maxLength: 1024,
			changedAt: opts.fileDate
		});

		// Benötigte Ressourcentypen definieren:
		var resourceTypes = new Array(); 
		resourceTypes.push({
			id: "RT-Pln",
			title: "SpecIF:Diagram",
			description: "A 'Diagram' is a graphical model view with a specific communication purpose, e.g. a business process or system composition.",
			propertyTypes: [{
					id: "PT-Pln-Name",
					title: "dcterms:title",
					dataType: "DT-ShortString",
					changedAt: opts.fileDate
				},
				{
					id: "PT-Pln-Diagram",
					title: "SpecIF:Diagram",
					dataType: "DT-formattedText",
					changedAt: opts.fileDate
				},
				{
					id: "PT-Pln-Notation",
					title: "SpecIF:Notation",
					dataType: "DT-ShortString",
					changedAt: opts.fileDate
				}
			],
			icon: "&#9635;",
			changedAt: opts.fileDate
		});
		resourceTypes.push({
			id: "RT-Act",
			title: "FMC:Actor",
			description: "An 'Actor' is a fundamental model element type representing an active entity, be it an activity, a process step, a function, a system component or a role.",
			propertyTypes: [{
					id: "PT-Act-Name",
					title: "dcterms:title",
					dataType: "DT-ShortString",
					changedAt: opts.fileDate
				},
				{
					id: "PT-Act-Stereotype",
					title: "SpecIF:Stereotype",
					dataType: "DT-ShortString",
					changedAt: opts.fileDate
				}
			],
			icon: "&#9632;",
			changedAt: opts.fileDate
		});
		resourceTypes.push({
			id: "RT-Sta",
			title: "FMC:State",
			description: "A 'State' is a fundamental model element type representing a passive entity, be it a value, a condition, an information storage or even a physical shape.",
			propertyTypes: [{
					id: "PT-Sta-Name",
					title: "dcterms:title",
					dataType: "DT-ShortString",
					changedAt: opts.fileDate
				},
				{
					id: "PT-Sta-Stereotype",
					title: "SpecIF:Stereotype",
					dataType: "DT-ShortString",
					changedAt: opts.fileDate
				}
			],
			icon: "&#9679;",
			changedAt: opts.fileDate
		});
		resourceTypes.push({
			id: "RT-Evt",
			title: "FMC:Event",
			description: "An 'Event' is a fundamental model element type representing a time reference, a change in condition/value or more generally a synchronisation primitive.",
			propertyTypes: [{
					id: "PT-Evt-Name",
					title: "dcterms:title",
					dataType: "DT-ShortString",
					changedAt: opts.fileDate
				},
				{
					id: "PT-Evt-Stereotype",
					title: "SpecIF:Stereotype",
					dataType: "DT-ShortString",
					changedAt: opts.fileDate
				}
			],
			icon: "&#9830;",
			changedAt: opts.fileDate
		});
		resourceTypes.push({
			id: "RT-Not",
			title: "SpecIF:Note",
			description: "A 'Note' is additional information by the author referring to any resource.",
			propertyTypes: [{
				id: "PT-Not-Name",
				title: "dcterms:title",
				dataType: "DT-ShortString",
				changedAt: opts.fileDate
			}],
			changedAt: opts.fileDate
		});
		resourceTypes.push({
			id: "RT-Col",
			title: "SpecIF:Collection",
			description: "A 'Collection' is an arbitrary group of resources linked with a SpecIF:contains statement. It corresponds to a 'Group' in BPMN Diagrams.",
			propertyTypes: [{
				id: "PT-Col-Name",
				title: "dcterms:title",
				dataType: "DT-ShortString",
				changedAt: opts.fileDate
			}],
			changedAt: opts.fileDate
		});
		resourceTypes.push({
			id: "RT-Fld",
			title: "SpecIF:Heading",
			description: "Folders with title and text for chapters or descriptive paragraphs.",
			isHeading: true,
			propertyTypes: [{
				id: "PT-Fld-Name",
				title: "dcterms:title",
				dataType: "DT-ShortString",
				changedAt: opts.fileDate
			}],
			changedAt: opts.fileDate
		});

		// Benötigte Statementtypen definieren:
		var statementTypes = new Array(); 
		statementTypes.push({
			id: "ST-Visibility",
			title: "SpecIF:shows",
			description: "Relation: Plan shows Model-Element",
			subjectTypes: ["RT-Pln"],
			objectTypes: ["RT-Act", "RT-Sta", "RT-Evt"],
			changedAt: opts.fileDate
		})
		statementTypes.push({
			id: "ST-Containment",
			title: "SpecIF:contains",
			description: "Relation: Model-Element contains Model-Element",
			subjectTypes: ["RT-Act", "RT-Sta", "RT-Evt"],
			objectTypes: ["RT-Act", "RT-Sta", "RT-Evt"],
			changedAt: opts.fileDate
		});
		statementTypes.push({
			id: "ST-Storage",
			title: "SpecIF:stores",
			description: "Relation: Actor (Role, Function) writes and reads State (Information)",
			subjectTypes: ["RT-Act"],
			objectTypes: ["RT-Sta"],
			changedAt: opts.fileDate
		});
		statementTypes.push({
			id: "ST-Writing",
			title: "SpecIF:writes",
			description: "Relation: Actor (Role, Function) writes State (Information)",
			subjectTypes: ["RT-Act"],
			objectTypes: ["RT-Sta"],
			changedAt: opts.fileDate
		});
		statementTypes.push({
			id: "ST-Reading",
			title: "SpecIF:reads",
			description: "Relation: Actor (Role, Function) reads State (Information)",
			subjectTypes: ["RT-Act"],
			objectTypes: ["RT-Sta"],
			changedAt: opts.fileDate
		});
		statementTypes.push({
			id: "ST-Preceding",
			title: "SpecIF:precedes",
			description: "A FMC:Actor 'precedes' a FMC:Actor; e.g. in a business process or activity flow.",
			subjectTypes: ["RT-Act"],
			objectTypes: ["RT-Act"],
			changedAt: opts.fileDate
		});
		statementTypes.push({
			id: "ST-Signalling",
			title: "SpecIF:signals",
			description: "A FMC:Actor 'signals' a FMC:Event.",
			subjectTypes: ["RT-Act", "RT-Evt"],
			objectTypes: ["RT-Evt"],
			changedAt: opts.fileDate
		});
		statementTypes.push({
			id: "ST-Triggering",
			title: "SpecIF:triggers",
			description: "A FMC:Event 'triggers' a FMC:Actor.",
			subjectTypes: ["RT-Evt"],
			objectTypes: ["RT-Act"],
			changedAt: opts.fileDate
		});
		statementTypes.push({
			id: "ST-ReferingTo",
			title: "SpecIF:refersTo",
			description: "A SpecIF:Comment, SpecIF:Note or SpecIF:Issue 'refers to' any other resource.",
			subjectTypes: ["RT-Not"],
			objectTypes: ["RT-Pln", "RT-Act", "RT-Sta", "RT-Evt", "RT-Not", "RT-Col"],
			changedAt: opts.fileDate
		});

		// Benötigte Hierarchietypen definieren
		var hierarchyTypes = new Array(); 
		hierarchyTypes.push({
			id: "HT-BPMN-Prozessmodell",
			title: "SpecIF:Hierarchy",
			description: "Root node of a process model (outline).",
			changedAt: opts.fileDate
		});

		// Resourcen und Statements einbinden
		var resources = new Array(); 
		var statements = new Array();

		elements.forEach( function(el) {
			if (el.hasOwnProperty("resourceType")) {
				resources.push(el);
			}
			if (el.hasOwnProperty("statementType")) {
				statements.push(el);
			}
		});

		// Hierarchiebeziehungen einbinden:
		var hierarchies = new Array(); 

		// Folder anlegen:
		resources = resources.concat([{ 
			id: "Folder1",
			resourceType: "RT-Fld",
			title: "Modell-Elemente (Glossar)",
			properties: [{
				propertyType: "PT-Fld-Name",
				value: "Modell-Elemente (Glossar)"
			}],
			changedAt: opts.fileDate
		}, {
			id: "Folder1.1",
			resourceType: "RT-Fld",
			title: "Akteure",
			properties: [{
				propertyType: "PT-Fld-Name",
				value: "Akteure"
			}],
			changedAt: opts.fileDate
		}, {
			id: "Folder1.2",
			resourceType: "RT-Fld",
			title: "Zustände",
			properties: [{
				propertyType: "PT-Fld-Name",
				value: "Zustände"
			}],
			changedAt: opts.fileDate
		}, {
			id: "Folder1.3",
			resourceType: "RT-Fld",
			title: "Ereignisse",
			properties: [{
				propertyType: "PT-Fld-Name",
				value: "Ereignisse"
			}],
			changedAt: opts.fileDate
		}]);

		let nodeList = new Array;
		nodeList.push({
			id: "N-Diagram",
			resource: resources[0].id,
			changedAt: opts.fileDate
		})
		nodeList.push({
			id: "N-Folder1",
			resource: "Folder1",
			nodes: [],
			changedAt: opts.fileDate
		});
		nodeList[1].nodes.push({
			id: "N-Folder1.1",
			resource: "Folder1.1",
			nodes: [],
			changedAt: opts.fileDate
		});
		nodeList[1].nodes.push({
			id: "N-Folder1.2",
			resource: "Folder1.2",
			nodes: [],
			changedAt: opts.fileDate
		});
		nodeList[1].nodes.push({
			id: "N-Folder1.3",
			resource: "Folder1.3",
			nodes: [],
			changedAt: opts.fileDate
		});

		// Folder mit Akteuren, Zuständen und Ereignisen füllen:
		resources.forEach( function(r) { 
			if (r.resourceType == "RT-Act") {
				nodeList[1].nodes[0].nodes.push({
					id: "N-" + r.id,
					resource: r.id,
					changedAt: opts.fileDate
				})
			};
			if (r.resourceType == "RT-Sta") {
				nodeList[1].nodes[1].nodes.push({
					id: "N-" + r.id,
					resource: r.id,
					changedAt: opts.fileDate
				})
			};
			if (r.resourceType == "RT-Evt") {
				nodeList[1].nodes[2].nodes.push({
					id: "N-" + r.id,
					resource: r.id,
					changedAt: opts.fileDate
				})
			}
		});

		hierarchies.push({
			id: "outline",
			title: model.title,
			hierarchyType: "HT-BPMN-Prozessmodell",
			nodes: nodeList,
			changedAt: opts.fileDate
		});

		// Verbinden der einzelnen SpecIF-Bestandteile mit dem Hauptknoten
		model.dataTypes = dataTypes;
		model.resourceTypes = resourceTypes;
		model.statementTypes = statementTypes;
		model.hierarchyTypes = hierarchyTypes;
		model.resources = resources;
		model.statements = statements;
		model.hierarchies = hierarchies;
		
		return model
	}
}
