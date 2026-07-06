"""
Concept graph storage. Wraps a networkx MultiDiGraph (multiple typed edges
between the same pair of concepts are allowed) with add/persist/load
operations, plus the minimal merge/remove-file operations needed to satisfy
this round's assigned graph_store tests. Issue 1 only needs same-file node
reuse (not full entity resolution, which is Issues 4/5) and JSON persistence
via networkx.node_link_data/node_link_graph.
"""
import json
import re
from pathlib import Path

import networkx as nx

from backend.extraction.extractor import ExtractionResult
from backend.ingestion.chunking import Chunk


def _slugify(name: str) -> str:
    """Derive a stable node id from a concept name, e.g. 'Machine Learning' -> 'concept_machine_learning'."""
    slug = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")
    return f"concept_{slug}"


class GraphStore:
    """Concept graph backed by a networkx MultiDiGraph, with JSON persistence."""

    def __init__(self, graph: nx.MultiDiGraph | None = None):
        """Wrap an existing MultiDiGraph, or start a fresh empty one if none is given."""
        self.graph: nx.MultiDiGraph = graph if graph is not None else nx.MultiDiGraph()

    def add_extraction_result(self, chunk: Chunk, result: ExtractionResult) -> list[str]:
        """
        Add/update concept nodes and typed relation edges from one chunk's
        extraction result.

        If a concept node already exists (matched by its slugified id), its
        `source_files` is extended with chunk.source_file instead of creating
        a duplicate node (same-file idempotency; full cross-file entity
        resolution is Issues 4/5). Relations are only added as edges when both
        endpoints are concepts named in this same result. Returns the list of
        node ids this chunk produced.
        """
        node_ids: list[str] = []
        name_to_id: dict[str, str] = {}

        for concept in result.concepts:
            name = concept.get("name", "")
            description = concept.get("description", "")
            if not name:
                continue
            node_id = _slugify(name)
            name_to_id[name] = node_id
            if self.graph.has_node(node_id):
                source_files = self.graph.nodes[node_id]["source_files"]
                if chunk.source_file not in source_files:
                    source_files.append(chunk.source_file)
            else:
                self.graph.add_node(
                    node_id,
                    id=node_id,
                    name=name,
                    description=description,
                    source_files=[chunk.source_file],
                )
            node_ids.append(node_id)

        for relation in result.relations:
            source_name = relation.get("source", "")
            target_name = relation.get("target", "")
            relation_label = relation.get("relation", "")
            source_id = name_to_id.get(source_name)
            target_id = name_to_id.get(target_name)
            if source_id and target_id and relation_label:
                self.graph.add_edge(source_id, target_id, relation=relation_label)

        return node_ids

    def merge_nodes(self, keep_id: str, merge_id: str) -> None:
        """
        Merge `merge_id` into `keep_id`: union their source_files onto
        `keep_id`, redirect any edges incident to `merge_id` so they point
        to/from `keep_id` instead, then remove `merge_id` from the graph.

        This is the graph-mutation primitive entity resolution (Issues 4/5)
        will call; implemented now (not deferred) because
        test_resolved_duplicate_concepts_are_merged_not_left_separate is in
        this round's assigned test scope.
        """
        keep_data = self.graph.nodes[keep_id]
        merge_data = self.graph.nodes[merge_id]
        for source_file in merge_data.get("source_files", []):
            if source_file not in keep_data["source_files"]:
                keep_data["source_files"].append(source_file)

        for _, target, edge_data in list(self.graph.out_edges(merge_id, data=True)):
            self.graph.add_edge(keep_id, target, **edge_data)
        for source, _, edge_data in list(self.graph.in_edges(merge_id, data=True)):
            self.graph.add_edge(source, keep_id, **edge_data)

        self.graph.remove_node(merge_id)

    def remove_file(self, source_file: str) -> None:
        """
        Remove `source_file`'s reference from every node's source_files.
        Nodes left with no remaining source files (solely attributable to
        this file) are removed entirely, along with their incident edges;
        nodes still referenced by other files are kept, with only the
        deleted file's reference removed.

        This is the deletion primitive the watcher (Issue 6/7) will call;
        implemented now (not deferred) because
        test_deleting_file_removes_only_nodes_solely_attributable_to_it is in
        this round's assigned test scope.
        """
        nodes_to_remove = []
        for node_id, data in self.graph.nodes(data=True):
            source_files = data.get("source_files", [])
            if source_file in source_files:
                source_files.remove(source_file)
                if not source_files:
                    nodes_to_remove.append(node_id)
        for node_id in nodes_to_remove:
            self.graph.remove_node(node_id)

    def persist(self, path: Path) -> None:
        """Serialize the graph to JSON at `path` using networkx.node_link_data."""
        data = nx.node_link_data(self.graph)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "GraphStore":
        """Reload a GraphStore from a JSON file previously written by persist()."""
        data = json.loads(path.read_text(encoding="utf-8"))
        graph = nx.node_link_graph(data, directed=True, multigraph=True)
        return cls(graph=graph)
