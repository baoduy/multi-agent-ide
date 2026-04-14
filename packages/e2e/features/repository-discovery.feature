Feature: Repository Discovery and Selection
  As a user with a configured working directory
  I want to browse and select repositories in the sidebar
  So that I can work with a specific project

  Background:
    Given the app has repos configured:
      | name          | branch  |
      | project-alpha | main    |
      | project-beta  | develop |
    And the dock layout is visible

  Scenario: Repos appear in the sidebar
    Then the sidebar should list "project-alpha"
    And the sidebar should list "project-beta"

  Scenario: Selecting a repo highlights it
    When I click on "project-alpha" in the sidebar
    Then "project-alpha" should be the active repo

  Scenario: Searching filters the repo list
    When I type "alpha" in the sidebar search
    Then the sidebar should list "project-alpha"
    And the sidebar should not list "project-beta"
