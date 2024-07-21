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

window.onload = function () {
  refreshPage();

  const width = 200;
  const height = 200;

  const sy = d3.scaleLinear().domain([0, 50]).range([0, -height]);

  const data = [10, 35, 5, 17, 29];

  d3.select("svg")
    .attr("width", width)
    .attr("height", height)
    .selectAll("rect")
    .data(data)
    .enter()
    .append("rect")
    .on("click", function (ev, d) {
      console.log(d);
    })
    .classed("bar", true)
    .attr("width", 30)
    .attr("height", function (d) {
      return -sy(d);
    })
    .attr("x", function (d, i) {
      return ((i + 1) * width) / 5 - 35;
    })
    .attr("y", function (d) {
      return height + sy(d);
    });
};
