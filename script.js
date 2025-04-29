document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const jsonTextInput = document.getElementById('json-text-input');
    const loadJsonButton = document.getElementById('load-json-button');
    const nodeDetails = document.getElementById('node-details');
    const nodeMapCanvas = document.getElementById('node-map-canvas');
    
    let currentJsonData = null; // Store the loaded JSON data
    let simulation = null; // D3 force simulation instance
    let tooltip = null; // Tooltip element
    let fetchedExampleData = null; // Store fetched example data

    // --- Fetch Example Data ---
    fetch('example.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            fetchedExampleData = data;
            console.log("Example data loaded successfully.");
            // Enable example buttons only after data is loaded
            document.querySelectorAll('.example-button').forEach(button => button.disabled = false);
        })
        .catch(error => {
            console.error('Error fetching example.json:', error);
            // Optionally disable or hide example buttons if fetch fails
            const exampleArea = document.getElementById('example-buttons');
            if (exampleArea) {
                exampleArea.innerHTML = '<p class="text-red-500 text-xs">Could not load examples.</p>';
            }
        });

    // Initialize tooltip
    initTooltip();
    
    // Check localStorage for saved data and restore if available
    restoreDataFromLocalStorage();

    // --- File Input Handling ---
    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            handleFile(file);
        }
    });

    dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (event) => {
        event.preventDefault();
        dropZone.classList.remove('dragover');
        if (event.dataTransfer.items) {
            if (event.dataTransfer.items[0].kind === 'file') {
                const file = event.dataTransfer.items[0].getAsFile();
                handleFile(file);
            }
        } else {
            const file = event.dataTransfer.files[0];
            handleFile(file);
        }
    });

    function handleFile(file) {
        if (file.type === 'application/json') {
            // Show loading
            showLoading();
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const jsonText = e.target.result;
                    const jsonData = JSON.parse(jsonText);
                    // Save to localStorage
                    saveToLocalStorage(jsonText);
                    currentJsonData = jsonData;
                    renderForceDirectedTree(currentJsonData);
                } catch (error) {
                    showError('Error parsing JSON file: ' + error.message);
                    clearVisualization();
                }
            };
            reader.readAsText(file);
        } else {
            showError('Please drop a valid JSON file.');
        }
    }

    // --- Text Input Handling ---
    loadJsonButton.addEventListener('click', () => {
        processTextInput();
    });
    
    // Allow pressing Enter in the text input to submit
    jsonTextInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.ctrlKey) {
            event.preventDefault();
            processTextInput();
        }
    });
    
    function processTextInput() {
        const jsonText = jsonTextInput.value.trim();
        if (jsonText) {
            // Show loading
            showLoading();
            
            try {
                const jsonData = JSON.parse(jsonText);
                // Save to localStorage
                saveToLocalStorage(jsonText);
                currentJsonData = jsonData;
                renderForceDirectedTree(currentJsonData);
                // Don't clear the input, it's useful to keep it for reference
                // jsonTextInput.value = ''; // Clear input after successful load
            } catch (error) {
                showError('Error parsing JSON text: ' + error.message);
                clearVisualization();
            }
        } else {
            showError('Please paste JSON text into the area.');
        }
    }
    
    // --- Local Storage Functions ---
    function saveToLocalStorage(jsonText) {
        try {
            localStorage.setItem('pluginVisualizerJsonData', jsonText);
            console.log('Data saved to localStorage');
        } catch (e) {
            console.warn('Failed to save to localStorage:', e);
        }
    }
    
    function restoreDataFromLocalStorage() {
        try {
            const savedData = localStorage.getItem('pluginVisualizerJsonData');
            if (savedData) {
                console.log('Found saved data, restoring and processing...');
                jsonTextInput.value = savedData; // Keep the data in the textarea for reference
                
                // Directly process the restored data
                processTextInput();
                
                // Optionally, show a small, temporary confirmation message instead of a button
                const confirmation = document.createElement('div');
                confirmation.className = 'bg-green-100 text-green-800 p-2 rounded text-sm mb-2 fade-out';
                confirmation.textContent = 'Restored and loaded data from last session.';
                
                const inputArea = document.querySelector('.input-area');
                inputArea.insertBefore(confirmation, inputArea.firstChild);
                
                // Remove the confirmation after a few seconds
                setTimeout(() => {
                    confirmation.remove();
                }, 5000); // Remove after 5 seconds
            }
        } catch (e) {
            console.warn('Failed to restore from localStorage:', e);
        }
    }

    // --- D3.js Force-Directed Tree Visualization ---
    function renderForceDirectedTree(jsonData) {
        console.log("Rendering force-directed tree for:", jsonData);
        clearVisualization();

        if (!jsonData || typeof jsonData !== 'object') {
            displayMessage('Invalid JSON data structure.');
            return;
        }

        // Convert flat JSON into hierarchical structure for tree layout
        const hierarchyData = convertToHierarchy(jsonData);
        
        // Set up the SVG container dimensions (enforce 60% height)
        const width = nodeMapCanvas.clientWidth;
        const height = width * 0.6; // Calculate height as 60% of width
        // Force height of the container div
        nodeMapCanvas.style.height = `${height}px`;
        
        const svg = d3.select("#node-map-canvas")
            .html('') // Clear any previous content
            .append("svg")
            .attr("width", "100%")
            .attr("height", "100%") // Set SVG height to 100% of the container
            .attr("viewBox", [0, 0, width, height]) // Use calculated dimensions
            .attr("class", "bg-white")
            .on("click", (event) => { // Add click listener to SVG background
                if (event.target === svg.node() || event.target === g.node()) {
                    d3.selectAll(".node").classed("highlighted", false); // Remove highlights
                    displayMessage("Load data and click on a node in the map below to see its details."); // Reset details panel
                    updatePathHighlighting(); // Update opacities
                }
            });
            
        // Create a group for the graph that can be zoomed/panned
        const g = svg.append("g");
            
        // Add zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.1, 3])
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            });
            
        // Apply zoom to the SVG, but filter events on nodes to allow dragging
        svg.call(zoom).on("dblclick.zoom", null); // Disable double-click zoom
        
        // Prepare nodes and links from hierarchy
        const root = hierarchyData; // The root of the hierarchy
        const nodes = root.descendants();
        const links = root.links();
        
        // Remove fixed root position - let simulation handle it
        // root.fx = width / 2;
        // root.fy = height / 2;
        
        // Set up force simulation
        simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links)
                .id(d => d.id)
                .distance(d => 50 + getNodeRadius(d.source.data) + getNodeRadius(d.target.data))
                .strength(1.5)) // Keep link strength high for elasticity
            .force("charge", d3.forceManyBody().strength(-600)) // Repulsion force
            .force("center", d3.forceCenter(width / 2, height / 2).strength(0.1)) // Re-enable centering force
            // Optionally add weak X/Y forces to encourage centering
            // .force("x", d3.forceX(width / 2).strength(0.05))
            // .force("y", d3.forceY(height / 2).strength(0.05))
            .force("collision", d3.forceCollide().radius(d => getNodeRadius(d.data) + 5).strength(1))
            .on("tick", ticked);
            
        // Create the links
        const link = g.append("g")
            .attr("class", "links")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .selectAll("line")
            .data(links)
            .join("line")
            .attr("stroke-width", 1.5);
        
        // Create the nodes
        const node = g.append("g")
            .attr("class", "nodes")
            .selectAll(".node")
            .data(nodes)
            .join("g")
            .attr("class", d => `node ${d.data.type}`)
            .call(drag(simulation)) // Apply drag behavior
            .on("click", function(event, d) {
                event.stopPropagation(); // Prevent zoom trigger on click

                // Clear previous highlights first
                d3.selectAll(".node").classed("highlighted", false);

                const clickedNodeData = d.data; // Access the underlying data object
                const clickedNodeType = clickedNodeData.type;
                const observerTypes = ['MessageObserver', 'AsyncMessageObserver', 'SyncMessageObserver'];

                if (clickedNodeType === 'Environment' && clickedNodeData.data?.classType) {
                    // If it's an Environment node with a classType, highlight all matching Environments
                    const classTypeToHighlight = clickedNodeData.data.classType;
                    d3.selectAll(".node")
                        .filter(node_d => 
                            node_d.data.type === 'Environment' && 
                            node_d.data.data?.classType === classTypeToHighlight
                        )
                        .classed("highlighted", true);
                } else if (observerTypes.includes(clickedNodeType) && clickedNodeData.messageType) {
                    // If it's an observer node with a messageType, highlight all related observers
                    const messageTypeToHighlight = clickedNodeData.messageType;
                    d3.selectAll(".node")
                        .filter(node_d => 
                            observerTypes.includes(node_d.data.type) && 
                            node_d.data.messageType === messageTypeToHighlight
                        )
                        .classed("highlighted", true);
                } else {
                    // Otherwise, highlight only the clicked node
                    d3.select(this).classed("highlighted", true);
                }

                // Always show details of the clicked node
                showNodeDetails(clickedNodeData.data);
                // Update path highlighting after setting classes
                updatePathHighlighting(); 
            })
            .on("mouseover", function(event, d) {
                // Show tooltip
                showTooltip(event, d);
            })
            .on("mouseout", function() {
                // Hide tooltip
                hideTooltip();
            });
        
        // Add circles to nodes
        node.append("circle")
            .attr("r", d => getNodeRadius(d.data))
            .attr("fill", d => getNodeColor(d.data.type))
            .attr("stroke", "#333")
            .attr("stroke-width", 1.5);
        
        // --- Add Node Labels --- 

        // 1. Internal letters for specific types
        node.filter(d => ['Composer', 'Container', 'Relay', 'Environment', 'Plugin'].includes(d.data.type))
            .append("text")
            .attr("dy", "0.35em") // Vertical centering
            .attr("x", 0) // Center horizontally
            .attr("text-anchor", "middle") // Center text
            .attr("font-size", d => `${getNodeRadius(d.data) * 1.2}px`) // Adjust font size based on radius
            .attr("fill", "#fff") // White text for contrast
            .style("font-weight", "bold")
            .text(d => d.data.type[0]); // First letter

        // 2. External labels for specific types
        node.filter(d => !['Composer', 'Container'].includes(d.data.type)) // Filter for nodes needing external labels (Plugin, Relay, Env, Observers)
            .append("text")
            .attr("dy", "0.35em")
            .attr("fill", "#333")
            .attr("font-size", "10px")
            .each(function(d) {
                const textElement = d3.select(this);
                textElement.text(''); // Clear default content

                const nodeType = d.data.type;
                const classType = d.data.data?.classType;
                const messageType = d.data.messageType; // For observers
                const nodeColor = getNodeColor(nodeType);
                const nodeRadius = getNodeRadius(d.data);
                
                // Position label outside the node
                textElement
                    .attr("x", d.children && d.children.length > 0 ? -nodeRadius - 5 : nodeRadius + 5)
                    .attr("text-anchor", d.children && d.children.length > 0 ? "end" : "start");

                // Set content based on node type
                if ((nodeType === 'Plugin' || nodeType === 'Relay' || nodeType === 'Environment') && classType) { // Only classType for Plugin/Relay/Env external label
                    textElement.append("tspan")
                        .style("font-weight", "bold")
                        .style("fill", nodeColor)
                        .text(classType);
                } else if ((nodeType === 'MessageObserver' || nodeType === 'AsyncMessageObserver' || nodeType === 'SyncMessageObserver') && messageType) {
                    textElement.append("tspan")
                        .style("font-weight", "bold")
                        .style("fill", nodeColor)
                        .text(messageType);
                } else if (!['Composer', 'Container', 'Relay', 'Environment'].includes(nodeType)) { // Fallback for other types needing external label but not covered above
                    textElement.text(nodeType || 'Unknown'); 
                }
                // Note: Relay/Environment with no classType won't show an external label, only the internal letter.
                // Note: Plugin with no classType won't show an external label, only the internal letter.
            });
            
        // Tick function to update positions
        function ticked() {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);
            
            node.attr("transform", d => `translate(${d.x},${d.y})`);
        }
        
        // Add drag capabilities (modified for snap-back)
        function drag(simulation) { 
            function dragstarted(event, d) {
                // Stop propagation to prevent zoom/pan on node drag
                event.sourceEvent.stopPropagation();
                if (!event.active) simulation.alphaTarget(0.3).restart(); // Heat up simulation
                d.fx = d.x; // Fix position during drag
                d.fy = d.y;
            }
            
            function dragged(event, d) {
                d.fx = event.x; // Update fixed position
                d.fy = event.y;
            }
            
            function dragended(event, d) {
                if (!event.active) simulation.alphaTarget(0); // Cool down simulation
                // Release the fixed position, allowing simulation forces to take over (snap-back)
                d.fx = null;
                d.fy = null;
            }
            
            return d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended);
        }

        // Function to update opacity based on highlighted paths
        function updatePathHighlighting() {
            const highlightedNodes = g.selectAll(".node.highlighted");
            const isAnyNodeHighlighted = !highlightedNodes.empty();

            const allNodes = g.selectAll(".node");
            const allLinks = g.selectAll(".links line");

            if (!isAnyNodeHighlighted) {
                // Reset all opacities and colors if nothing is highlighted
                allNodes.style("opacity", 1);
                allLinks
                    .style("stroke", "#999") // Reset stroke color
                    .style("stroke-opacity", 0.6); // Reset stroke opacity
                return;
            }

            const pathNodes = new Set();
            const pathLinks = new Set();
            const highlightedData = highlightedNodes.data();

            highlightedData.forEach(hData => {
                hData.ancestors().forEach(ancestor => pathNodes.add(ancestor));
            });

            // Add links that connect two nodes within the pathNodes set
            links.forEach(link => {
                if (pathNodes.has(link.source) && pathNodes.has(link.target)) {
                    pathLinks.add(link);
                }
            });

            // Dim everything first
            allNodes.style("opacity", 0.3);
            allLinks
                .style("stroke", "#999") // Ensure dimmed links are default color
                .style("stroke-opacity", 0.15);

            // Highlight path nodes
            allNodes.filter(d => pathNodes.has(d))
                .style("opacity", 1);

            // Highlight path links
            allLinks.filter(l => pathLinks.has(l))
                .style("stroke", "#FFBF00") // Set stroke color to yellow
                .style("stroke-opacity", 0.8); // Set stroke opacity
        }

        // --- Visibility Toggle Logic ---
        const visibilityToggle = document.getElementById('visibility-toggle');
        const typesToToggle = ['MessageObserver', 'AsyncMessageObserver', 'SyncMessageObserver', 'Environment'];

        function setNodeVisibility(showDetails) {
            const allNodes = g.selectAll(".node"); // Re-select within function scope if needed
            const allLinks = g.selectAll(".links line"); // Re-select within function scope if needed

            // Toggle nodes
            allNodes.filter(d => typesToToggle.includes(d.data.type))
                .style("display", showDetails ? null : "none");

            // Toggle links connected to hidden node types
            allLinks.style("display", function(l) {
                const sourceHidden = !showDetails && typesToToggle.includes(l.source.data.type);
                const targetHidden = !showDetails && typesToToggle.includes(l.target.data.type);
                // Hide link if either end is a hidden type AND the switch is set to hide
                return (sourceHidden || targetHidden) ? "none" : null;
            });
            
            // Re-apply path highlighting if visibility changed
            // updatePathHighlighting(); // This might conflict slightly, let's see
        }

        if (visibilityToggle) {
            visibilityToggle.addEventListener('change', function() {
                setNodeVisibility(!this.checked); // Pass true to show, false to hide
            });
            // Set initial state based on checkbox default (unchecked = show)
            setNodeVisibility(!visibilityToggle.checked); 
        } else {
            console.warn("Visibility toggle checkbox not found.");
        }

        // Hide loading indicator
        hideLoading();
    }

    // Convert a JSON structure to D3 hierarchy
    function convertToHierarchy(data) {
        // First, convert the JSON to a hierarchical structure
        const root = buildHierarchyFromJson(data);
        
        // Then convert to D3 hierarchy
        return d3.hierarchy(root);
    }
    
    function buildHierarchyFromJson(jsonNode, parent = null) {
        if (!jsonNode || typeof jsonNode !== 'object') return null;
        
        // Create a node object with basic properties
        const node = {
            id: jsonNode.id || `node_${Math.random().toString(16).slice(2)}`,
            type: jsonNode.nodeType || 'Unknown',
            data: jsonNode, // Keep original data for details display
            children: []
        };
        
        // Add children recursively
        if (jsonNode.children && Array.isArray(jsonNode.children)) {
            jsonNode.children.forEach(childData => {
                const childNode = buildHierarchyFromJson(childData, node);
                if (childNode) node.children.push(childNode);
            });
        }
        
        // Add plugins as children
        if (jsonNode.plugins && Array.isArray(jsonNode.plugins)) {
            jsonNode.plugins.forEach(pluginData => {
                const pluginNode = buildHierarchyFromJson(pluginData, node);
                if (pluginNode) node.children.push(pluginNode);
            });
        }
        
        // Add relays as children
        if (jsonNode.relays && Array.isArray(jsonNode.relays)) {
            jsonNode.relays.forEach(relayData => {
                const relayNode = buildHierarchyFromJson(relayData, node);
                if (relayNode) node.children.push(relayNode);
            });
        }
        
        // Add environments as children
        if (jsonNode.environments && Array.isArray(jsonNode.environments)) {
            jsonNode.environments.forEach(envData => {
                const envNode = buildHierarchyFromJson(envData, node);
                if (envNode) node.children.push(envNode);
            });
        }
        
        // Add messageObservers as children for Plugin and Relay nodes
        // Updated to handle asyncMessageObservers and syncMessageObservers
        const observerTypes = ['asyncMessageObservers', 'syncMessageObservers'];
        if (node.type === 'Plugin' || node.type === 'Relay') {
            observerTypes.forEach(observerKey => {
                if (jsonNode[observerKey] && Array.isArray(jsonNode[observerKey])) {
                    jsonNode[observerKey].forEach((observer, index) => {
                        // Use observer.nodeType for the type, fallback if needed
                        const observerNodeType = observer?.nodeType || 'MessageObserver'; 
                        if (observer && typeof observer === 'object' && observer.messageType) {
                            const observerNode = {
                                id: `${node.id}_${observerKey}_${index}_${observer.messageType}`,
                                type: observerNodeType, // Use the type from the observer data
                                messageType: observer.messageType, 
                                data: observer, 
                                children: [] 
                            };
                            node.children.push(observerNode);
                        }
                    });
                }
            });
        }
        
        return node;
    }

    function getNodeRadius(node) {
        // Different sizes based on node type
        switch(node.type) {
            case 'Composer': return 20;
            case 'Container': return 16;
            case 'Plugin': return 12;
            case 'Relay': return 8;
            case 'Environment': return 8;
            case 'MessageObserver': return 6; // Keep as fallback?
            case 'AsyncMessageObserver': return 6;
            case 'SyncMessageObserver': return 6;
            default: return 8;
        }
    }

    function getNodeColor(nodeType) {
        // Different colors based on node type
        switch(nodeType) {
            case 'Composer': return '#364fc7'; // primary-500
            case 'Container': return '#339af0'; // primary-800
            case 'Plugin': return '#faa2c1';    // primary-400
            case 'Relay': return '#da77f2';     // primary-300
            case 'Environment': return '#34D399'; // green
            case 'MessageObserver': return '#F97316'; // orange-500 (fallback)
            case 'AsyncMessageObserver': return '#d9480f'; // amber-500
            case 'SyncMessageObserver': return '#fd7e14'; // orange-500
            default: return '#CBD5E0'; // gray
        }
    }

    function getNodeTypeDescription(nodeType) {
        switch(nodeType) {
            case 'Composer': return 'Main composition root';
            case 'Container': return 'Container for plugins';
            case 'Plugin': return 'Plugin implementation';
            case 'Relay': return 'Message relay';
            case 'Environment': return 'Environment configuration';
            default: return nodeType;
        }
    }

    function clearVisualization() {
        // Clear the SVG
        nodeMapCanvas.innerHTML = '';
        
        // Stop any active simulation
        if (simulation) {
            simulation.stop();
            simulation = null;
        }
        
        // Clear details
        displayMessage("Load data and click on a node in the map below to see its details.");
    }

    // --- Details Panel ---
    function showNodeDetails(nodeData) {
        // Format the JSON data for pretty display with syntax highlighting
        const formattedJson = JSON.stringify(nodeData, null, 2);
        
        // Create a container with limited width to prevent horizontal expansion
        nodeDetails.innerHTML = `
            <div class="w-full overflow-hidden">
                <pre><code class="language-json overflow-x-auto">${escapeHtml(formattedJson)}</code></pre>
            </div>
        `;
        
        // Apply syntax highlighting
        hljs.highlightAll();
    }
    
    function displayMessage(message) {
        nodeDetails.innerHTML = `
            <div class="flex items-center justify-center h-full text-center">
                <div>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-gray-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p>${message}</p>
                </div>
            </div>
        `;
    }

    function showError(message) {
        nodeDetails.innerHTML = `
            <div class="flex items-center justify-center h-full text-center">
                <div>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-red-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p class="text-red-500 font-medium">${message}</p>
                </div>
            </div>
        `;
    }

    // --- Loading Indicator ---
    function showLoading() {
        // Clear any existing content
        nodeMapCanvas.innerHTML = `
            <div class="flex items-center justify-center h-full">
                <div class="text-center">
                    <div class="loading-spinner mx-auto mb-4"></div>
                    <p class="text-gray-600">Processing data...</p>
                </div>
            </div>
        `;
        
        // Also update details panel
        nodeDetails.innerHTML = `
            <div class="flex items-center justify-center h-full">
                <div class="text-center">
                    <div class="loading-spinner mx-auto mb-4"></div>
                    <p class="text-gray-600">Processing data...</p>
                </div>
            </div>
        `;
    }
    
    function hideLoading() {
        // This is handled by the rendering function
    }

    // --- Tooltip ---
    function initTooltip() {
        // Create tooltip element
        tooltip = d3.select("body")
            .append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);
    }
    
    function showTooltip(event, d) {
        const nodeType = d.data.type || 'Unknown';
        const nodeId = d.data.id || 'No ID';
        const description = getNodeTypeDescription(nodeType);
        let detailsHtml = '';

        if (nodeType === 'Environment' && d.data.data?.value !== undefined) {
            const nodeValue = escapeHtml(String(d.data.data.value)); // Get and escape value
            detailsHtml = `<div class="text-xs mt-1">Value: ${nodeValue}</div>`;
        } else if (nodeId !== 'No ID') {
            detailsHtml = `<div class="text-xs mt-1">ID: ${nodeId}</div>`;
        }
        
        tooltip.transition()
            .duration(200)
            .style("opacity", .9);
            
        tooltip.html(`
            <div class="font-medium">${nodeType}</div>
            <div class="text-xs opacity-75">${description}</div>
            ${detailsHtml}
        `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
    }
    
    function hideTooltip() {
        tooltip.transition()
            .duration(500)
            .style("opacity", 0);
    }
    
    // Helper function to escape HTML for safe display
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // --- Example Data Loader ---
    function loadExample(exampleKey) {
        if (!fetchedExampleData) {
            showError("Example data is not loaded yet. Please wait or check console.");
            return;
        }
        const data = fetchedExampleData[exampleKey];
        if (data) {
            showLoading();
            // Use setTimeout to allow loading indicator to render
            setTimeout(() => {
                try {
                    const jsonText = JSON.stringify(data, null, 2);
                    jsonTextInput.value = jsonText; // Show in text area
                    saveToLocalStorage(jsonText);   // Save to local storage
                    currentJsonData = data;
                    renderForceDirectedTree(currentJsonData);
                } catch (error) {
                    showError('Error processing example JSON: ' + error.message);
                    clearVisualization();
                }
            }, 50); // Small delay
        }
    }

    // Disable example buttons initially
    document.querySelectorAll('.example-button').forEach(button => button.disabled = true);

    document.getElementById('example-btn-simple')?.addEventListener('click', () => loadExample('simple'));
    document.getElementById('example-btn-nested')?.addEventListener('click', () => loadExample('nested'));
    document.getElementById('example-btn-observers')?.addEventListener('click', () => loadExample('observers'));
    document.getElementById('example-btn-envs')?.addEventListener('click', () => loadExample('envs'));
    document.getElementById('example-btn-live')?.addEventListener('click', () => loadExample('liveRoom'));
}); 