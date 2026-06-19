# error: a doc-string is opened with """ but never closed
Feature: Broken
  Scenario: bad docstring
    Given a payload
      """
      { "key": "value" }
    When it is sent
