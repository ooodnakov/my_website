import unittest

from source_provenance import _expand_reference


class SourceReferenceExpansionTest(unittest.TestCase):
    def test_recipe_variables_resolve_in_upstream_source_urls(self):
        variables = {"_v": "2.42", "pkgver": "1.2_beta"}

        reference = _expand_reference(
            "https://example.test/v$_v/less-${pkgver/_beta/-beta}.tar.gz",
            variables,
        )

        self.assertEqual(reference, "https://example.test/v2.42/less-1.2-beta.tar.gz")

    def test_shell_prefix_and_suffix_removal_preserves_version_material(self):
        variables = {
            "pkgver": "15.2.0_git20261001",
            "kernel": "6.18.54",
        }

        self.assertEqual(_expand_reference("gcc-${pkgver%%_git*}", variables), "gcc-15.2.0")
        self.assertEqual(_expand_reference("linux-${kernel%.*}", variables), "linux-6.18")


if __name__ == "__main__":
    unittest.main()
