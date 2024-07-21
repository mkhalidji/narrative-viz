const pageState = {
  currentPage: 0,
};

const pages = [
  {
    content: "<svg></svg>",
  },
  { content: "This is the middle page." },
  { content: "This is the last page." },
];

const pageCount = pages.length;

function refreshPage() {
  const { currentPage } = pageState;

  const viz = document.getElementById("viz");
  viz.innerHTML = pages[currentPage].content;

  const leftNav = document.getElementById("left-nav");
  const rightNav = document.getElementById("right-nav");

  if (currentPage == 0) {
    leftNav.classList.add("disabled");
  } else {
    leftNav.classList.remove("disabled");
  }

  if (currentPage == pageCount - 1) {
    rightNav.classList.add("disabled");
  } else {
    rightNav.classList.remove("disabled");
  }
}

function onNavClick(direction) {
  const { currentPage } = pageState;

  if (direction > 0 && currentPage + 1 < pageCount) {
    Object.assign(pageState, { currentPage: currentPage + 1 });
  } else if (direction < 0 && currentPage > 0) {
    Object.assign(pageState, { currentPage: currentPage - 1 });
  }

  refreshPage();
}

window.onload = async function () {
  refreshPage();

  const width = 975;
  const height = 610;

  const us = await d3.json("data/counties-albers-10m.json");
  console.log(us);

  const zoom = d3.zoom().scaleExtent([1, 8]);

  const svg = d3
    .select("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", width)
    .attr("height", height);

  const path = d3.geoPath();

  const g = svg.append("g");

  const states = g
    .append("g")
    .attr("fill", "#4453")
    .attr("cursor", "pointer")
    .selectAll("path")
    .data(topojson.feature(us, us.objects.states).features)
    .join("path")
    .attr("d", path);

  states.append("title").text((d) => d.properties.name);

  g.append("path")
    .attr("fill", "none")
    .attr("stroke", "lightgrey")
    .attr("stroke-linejoin", "round")
    .attr("d", path(topojson.mesh(us, us.objects.states, (a, b) => a !== b)));
};
